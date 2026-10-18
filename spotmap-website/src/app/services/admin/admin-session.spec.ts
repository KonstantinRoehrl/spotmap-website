import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AdminAuthError,
  AdminAuthErrorKind,
  AdminSession,
  adminRedirectUrl,
} from './admin-session';
import { ADMIN_SUPABASE_LOADER } from './admin-supabase';

type AuthCallback = (event: string, session: FakeSession | null) => void;

interface FakeSession {
  user: { email: string };
}

/** The slice of supabase-js AdminSession calls, with every call recorded. */
class FakeSupabase {
  session: FakeSession | null = null;
  isAdmin = true;
  readonly callbacks: AuthCallback[] = [];

  readonly auth = {
    initialize: jasmine
      .createSpy('initialize')
      .and.resolveTo({ error: null as { message: string } | null }),
    getSession: jasmine.createSpy('getSession').and.callFake(async () => ({
      data: { session: this.session },
      error: null,
    })),
    signInWithOtp: jasmine
      .createSpy('signInWithOtp')
      .and.resolveTo({ data: { user: null, session: null }, error: null }),
    verifyOtp: jasmine.createSpy('verifyOtp').and.callFake(async () => ({
      data: { user: this.session?.user ?? null, session: this.session },
      error: null,
    })),
    signOut: jasmine.createSpy('signOut').and.resolveTo({ error: null }),
    onAuthStateChange: jasmine
      .createSpy('onAuthStateChange')
      .and.callFake((callback: AuthCallback) => {
        this.callbacks.push(callback);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }),
  };

  readonly rpc = jasmine.createSpy('rpc').and.callFake(async () => ({
    data: this.isAdmin,
    error: null,
    status: 200,
  }));

  /** Plays an auth event the way supabase-js reports one from another tab or a token refresh. */
  emit(event: string, session: FakeSession | null): void {
    for (const callback of this.callbacks) callback(event, session);
  }
}

/** One macrotask: AdminSession defers its reaction to auth events by `setTimeout(…, 0)`. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('AdminSession', () => {
  let fake: FakeSupabase;
  let loader: jasmine.Spy<() => Promise<SupabaseClient>>;

  beforeEach(() => {
    fake = new FakeSupabase();
    loader = jasmine
      .createSpy('adminSupabaseLoader')
      .and.callFake(async () => fake as unknown as SupabaseClient);
    TestBed.configureTestingModule({
      providers: [{ provide: ADMIN_SUPABASE_LOADER, useValue: loader }],
    });
  });

  const session = () => TestBed.inject(AdminSession);

  it('starts loading and settles signed out when there is no stored session', async () => {
    expect(session().state()).toEqual({ status: 'loading' });
    await expectAsync(session().ready()).toBeResolvedTo({
      status: 'signed-out',
      linkError: null,
    });
    expect(session().state()).toEqual({
      status: 'signed-out',
      linkError: null,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('asks the database whether a signed-in user is an admin', async () => {
    fake.session = { user: { email: 'maintainer@example.org' } };
    await expectAsync(session().ready()).toBeResolvedTo({
      status: 'signed-in',
      email: 'maintainer@example.org',
      isAdmin: true,
    });
    expect(fake.rpc).toHaveBeenCalledOnceWith('is_admin');
  });

  it('reports a signed-in user the database does not list as an admin', async () => {
    fake.session = { user: { email: 'visitor@example.org' } };
    fake.isAdmin = false;
    await session().ready();
    expect(session().state()).toEqual({
      status: 'signed-in',
      email: 'visitor@example.org',
      isAdmin: false,
    });
  });

  it('loads the client and reads the session once, however often ready() is awaited', async () => {
    await Promise.all([session().ready(), session().ready()]);
    await session().ready();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fake.auth.getSession).toHaveBeenCalledTimes(1);
    expect(fake.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('lets the client finish reading the URL before it reads the session', async () => {
    await session().ready();
    expect(fake.auth.initialize).toHaveBeenCalledBefore(fake.auth.getSession);
  });

  it('reports an expired or used sign-in link in the signed-out state', async () => {
    fake.auth.initialize.and.resolveTo({
      error: {
        name: 'AuthImplicitGrantRedirectError',
        message: 'Email link is invalid or has expired',
      } as unknown as { message: string },
    });
    await session().ready();
    expect(session().state()).toEqual({
      status: 'signed-out',
      linkError: 'invalid-code',
    });
  });

  it('rejects with a network error when supabase-js cannot load, and retries on the next call', async () => {
    let calls = 0;
    loader.and.callFake(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError('Failed to fetch dynamically imported module');
      }
      return fake as unknown as SupabaseClient;
    });
    await expectAsync(session().ready()).toBeRejectedWith(
      jasmine.objectContaining({ name: 'AdminAuthError', kind: 'network' }),
    );
    expect(session().state()).toEqual({
      status: 'signed-out',
      linkError: null,
    });
    await expectAsync(session().ready()).toBeResolvedTo({
      status: 'signed-out',
      linkError: null,
    });
  });

  it('rejects when the admin check fails, instead of guessing', async () => {
    fake.session = { user: { email: 'maintainer@example.org' } };
    fake.rpc.and.resolveTo({
      data: null,
      error: { message: 'TypeError: Failed to fetch', code: '' },
      status: 0,
    });
    await expectAsync(session().ready()).toBeRejectedWith(
      jasmine.objectContaining({ kind: 'network' }),
    );
  });

  it('mails a link and code to existing users only, returning to the admin route', async () => {
    await session().requestSignIn('  maintainer@example.org ');
    expect(fake.auth.signInWithOtp).toHaveBeenCalledOnceWith({
      email: 'maintainer@example.org',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: adminRedirectUrl(document),
      },
    });
  });

  const failures: ReadonlyArray<
    readonly [string, Record<string, unknown>, AdminAuthErrorKind]
  > = [
    [
      'the email rate limit',
      { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit' },
      'rate-limited',
    ],
    [
      'the request rate limit',
      { name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' },
      'rate-limited',
    ],
    [
      'an address with no account',
      { name: 'AuthApiError', status: 422, code: 'otp_disabled' },
      'not-allowed',
    ],
    [
      'closed sign-ups',
      { name: 'AuthApiError', status: 422, code: 'signup_disabled' },
      'not-allowed',
    ],
    [
      'an address the default mailer will not send to',
      {
        name: 'AuthApiError',
        status: 400,
        code: 'email_address_not_authorized',
      },
      'not-allowed',
    ],
    [
      'a dropped connection',
      { name: 'AuthRetryableFetchError', status: 0 },
      'network',
    ],
    [
      'a server failure',
      { name: 'AuthApiError', status: 500, code: 'unexpected_failure' },
      'unknown',
    ],
  ];

  for (const [what, error, kind] of failures) {
    it(`turns ${what} into a '${kind}' sign-in error`, async () => {
      fake.auth.signInWithOtp.and.resolveTo({
        data: { user: null, session: null },
        error,
      });
      await expectAsync(
        session().requestSignIn('maintainer@example.org'),
      ).toBeRejectedWith(
        jasmine.objectContaining({ name: 'AdminAuthError', kind }),
      );
    });
  }

  it('gives every error kind a message that says what to do next', () => {
    const kinds: AdminAuthErrorKind[] = [
      'rate-limited',
      'not-allowed',
      'invalid-code',
      'network',
      'unknown',
    ];
    const messages = kinds.map((kind) => new AdminAuthError(kind).message);
    expect(new Set(messages).size).toBe(kinds.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(20);
    }
  });

  it('signs in with the emailed code and becomes a signed-in admin', async () => {
    await session().ready();
    fake.session = { user: { email: 'maintainer@example.org' } };
    await session().verifyCode('maintainer@example.org', ' 123456 ');
    expect(fake.auth.verifyOtp).toHaveBeenCalledOnceWith({
      email: 'maintainer@example.org',
      token: '123456',
      type: 'email',
    });
    expect(session().state()).toEqual({
      status: 'signed-in',
      email: 'maintainer@example.org',
      isAdmin: true,
    });
  });

  it("turns a wrong or expired code into an 'invalid-code' error", async () => {
    fake.auth.verifyOtp.and.resolveTo({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', status: 403, code: 'otp_expired' },
    });
    await expectAsync(
      session().verifyCode('maintainer@example.org', '000000'),
    ).toBeRejectedWith(jasmine.objectContaining({ kind: 'invalid-code' }));
  });

  it('signs out', async () => {
    fake.session = { user: { email: 'maintainer@example.org' } };
    await session().ready();
    await session().signOut();
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
    expect(session().state()).toEqual({
      status: 'signed-out',
      linkError: null,
    });
  });

  it('keeps the session when signing out fails, and says why', async () => {
    fake.session = { user: { email: 'maintainer@example.org' } };
    await session().ready();
    fake.auth.signOut.and.resolveTo({
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });
    await expectAsync(session().signOut()).toBeRejectedWith(
      jasmine.objectContaining({ kind: 'network' }),
    );
    expect(session().state().status).toBe('signed-in');
  });

  it('follows a sign-out from another tab', async () => {
    fake.session = { user: { email: 'maintainer@example.org' } };
    await session().ready();
    fake.emit('SIGNED_OUT', null);
    await nextTask();
    expect(session().state()).toEqual({
      status: 'signed-out',
      linkError: null,
    });
  });

  it('re-checks admin rights when another user signs in', async () => {
    await session().ready();
    fake.isAdmin = false;
    fake.emit('SIGNED_IN', { user: { email: 'visitor@example.org' } });
    await nextTask();
    await nextTask();
    expect(session().state()).toEqual({
      status: 'signed-in',
      email: 'visitor@example.org',
      isAdmin: false,
    });
  });

  it('ignores the initial-session event ready() already handled', async () => {
    fake.session = { user: { email: 'maintainer@example.org' } };
    await session().ready();
    fake.emit('INITIAL_SESSION', fake.session);
    await nextTask();
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('builds the redirect from the base href, so the Pages path is kept', () => {
    expect(
      adminRedirectUrl({
        baseURI: 'https://example.github.io/spotmap-website/',
      } as Document),
    ).toBe('https://example.github.io/spotmap-website/admin');
    expect(
      adminRedirectUrl({ baseURI: 'http://127.0.0.1:4200/' } as Document),
    ).toBe('http://127.0.0.1:4200/admin');
  });
});
