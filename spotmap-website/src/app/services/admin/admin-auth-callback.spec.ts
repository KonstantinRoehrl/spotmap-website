import {
  APP_INITIALIZER,
  DOCUMENT,
  EnvironmentInjector,
  createEnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  isAuthCallback,
  provideAdminAuthCallback,
} from './admin-auth-callback';
import { AdminSession, AdminSessionState } from './admin-session';

/** A magic link's success fragment as Supabase's implicit flow writes it. */
const SIGNED_IN_HASH =
  '#access_token=eyJ.spec&expires_at=1790000000&expires_in=3600&refresh_token=r1&token_type=bearer&type=magiclink';

/** An expired link's fragment. */
const EXPIRED_HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

/**
 * Runs provideAdminAuthCallback()'s initializers in their own injector, with the given URL
 * fragment and a fake session, and reports whether app initialisation has finished.
 */
function bootWith(
  hash: string,
  ready: () => Promise<AdminSessionState>,
): { readySpy: jasmine.Spy; settled: () => boolean; done: Promise<unknown> } {
  const readySpy = jasmine.createSpy('ready').and.callFake(ready);
  const injector = createEnvironmentInjector(
    [
      provideAdminAuthCallback(),
      { provide: AdminSession, useValue: { ready: readySpy } },
      {
        provide: DOCUMENT,
        useValue: { location: { hash } } as unknown as Document,
      },
    ],
    TestBed.inject(EnvironmentInjector),
  );
  const results = injector
    .get(APP_INITIALIZER, [])
    .map((initializer) => runInInjectionContext(injector, initializer));
  let finished = false;
  const done = Promise.all(results).then(() => (finished = true));
  return { readySpy, settled: () => finished, done };
}

describe('isAuthCallback', () => {
  it('recognises a sign-in link’s success and error fragments', () => {
    expect(isAuthCallback(SIGNED_IN_HASH)).toBeTrue();
    expect(isAuthCallback(EXPIRED_HASH)).toBeTrue();
  });

  it('ignores every other fragment', () => {
    expect(isAuthCallback('')).toBeFalse();
    expect(isAuthCallback('#')).toBeFalse();
    expect(isAuthCallback('#about')).toBeFalse();
    expect(isAuthCallback('#my_access_token=x')).toBeFalse();
  });
});

describe('provideAdminAuthCallback', () => {
  it('holds app initialisation — and so the first navigation — until the session has read a callback', async () => {
    let finishReady!: (state: AdminSessionState) => void;
    const boot = bootWith(
      SIGNED_IN_HASH,
      () => new Promise((resolve) => (finishReady = resolve)),
    );
    await new Promise<void>((resolve) => setTimeout(resolve));
    expect(boot.readySpy).toHaveBeenCalledTimes(1);
    expect(boot.settled()).toBeFalse();

    finishReady({
      status: 'signed-in',
      email: 'maintainer@example.org',
      isAdmin: true,
    });
    await boot.done;
    expect(boot.settled()).toBeTrue();
  });

  it('also waits on an error callback, so the session can report the failed link', async () => {
    const boot = bootWith(EXPIRED_HASH, async () => ({
      status: 'signed-out',
      linkError: null,
    }));
    await boot.done;
    expect(boot.readySpy).toHaveBeenCalledTimes(1);
  });

  it('leaves the public site alone: no callback, no session, no supabase-js download', async () => {
    const boot = bootWith('', async () => ({
      status: 'signed-out',
      linkError: null,
    }));
    await boot.done;
    expect(boot.readySpy).not.toHaveBeenCalled();
    expect(boot.settled()).toBeTrue();
  });

  it('lets the app start when the session cannot load, and warns', async () => {
    const warn = spyOn(console, 'warn');
    const boot = bootWith(SIGNED_IN_HASH, () =>
      Promise.reject(new Error('chunk load failed')),
    );
    await expectAsync(boot.done).toBeResolved();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
