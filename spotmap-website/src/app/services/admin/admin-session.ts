import { DOCUMENT, Injectable, Signal, inject, signal } from '@angular/core';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

import { ADMIN_SUPABASE_LOADER } from './admin-supabase';

/**
 * Where the maintainer's sign-in stands: `loading` until {@link AdminSession.ready} has read the
 * stored session (and any sign-in link in the URL), then signed out — with `linkError` saying why
 * a sign-in link in the URL failed, null when there was none or it worked — or signed in with the
 * account's email and whether the database lists it in `admins`.
 */
export type AdminSessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; linkError: AdminAuthErrorKind | null }
  | { status: 'signed-in'; email: string; isAdmin: boolean };

/**
 * Why a sign-in call failed, in the terms the sign-in page words its advice in:
 * `rate-limited` — too many emails or requests; `not-allowed` — the address has no maintainer
 * account (sign-ups are off) or the mailer refuses it; `invalid-code` — the code is wrong or
 * expired; `network` — the request or the library download never got an answer; `unknown` —
 * anything else.
 */
export type AdminAuthErrorKind =
  'rate-limited' | 'not-allowed' | 'invalid-code' | 'network' | 'unknown';

/** The copy the sign-in page shows for each {@link AdminAuthErrorKind}: what happened and what to do. */
const ADVICE: Record<AdminAuthErrorKind, string> = {
  'rate-limited':
    'Too many sign-in emails in a short time. Use the code from the last email, or wait a few minutes and send again.',
  'not-allowed':
    'This address has no maintainer account. Check the spelling, or ask for maintainer access.',
  'invalid-code':
    'That code is wrong or has expired. Check the newest email, or send a new code.',
  network:
    'The sign-in service could not be reached. Check the connection and try again.',
  unknown: 'Sign-in failed unexpectedly. Try again in a moment.',
};

/** Auth error codes (supabase-js 2.118 `ErrorCode`) that mean "too many requests". */
const RATE_LIMITED_CODES: ReadonlySet<string> = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
]);

/** Auth error codes that mean this address may not sign in here. */
const NOT_ALLOWED_CODES: ReadonlySet<string> = new Set([
  'otp_disabled',
  'signup_disabled',
  'user_not_found',
  'user_banned',
  'email_address_not_authorized',
]);

/** Auth error codes that mean the code (or link) is wrong or expired. */
const INVALID_CODE_CODES: ReadonlySet<string> = new Set(['otp_expired']);

/** A failed sign-in call; its message is the advice the sign-in page shows. */
export class AdminAuthError extends Error {
  override readonly name = 'AdminAuthError';

  /**
   * @param kind what went wrong, which picks the message
   * @param cause the supabase-js error or exception it came from
   */
  constructor(
    readonly kind: AdminAuthErrorKind,
    cause?: unknown,
  ) {
    super(ADVICE[kind], { cause });
  }
}

/**
 * Classifies a supabase-js failure by its shape — `name`, `status`, `code` — rather than with the
 * library's own `isAuth…Error` helpers, which would put supabase-js into the initial bundle
 * (AdminSession is reached from app.config.ts through the auth-callback initializer).
 *
 * @param error an `AuthError`, a `PostgrestError`, an exception, or an AdminAuthError (kept as is)
 * @param status the HTTP status when it travels beside the error (a PostgREST response's), 0 when
 *   the request got no answer
 */
function toAdminAuthError(error: unknown, status?: number): AdminAuthError {
  if (error instanceof AdminAuthError) return error;
  const failure = (
    typeof error === 'object' && error !== null ? error : {}
  ) as {
    name?: unknown;
    status?: unknown;
    code?: unknown;
  };
  const code = typeof failure.code === 'string' ? failure.code : '';
  const httpStatus = status ?? failure.status;
  let kind: AdminAuthErrorKind = 'unknown';
  if (RATE_LIMITED_CODES.has(code) || httpStatus === 429) {
    kind = 'rate-limited';
  } else if (NOT_ALLOWED_CODES.has(code)) {
    kind = 'not-allowed';
  } else if (INVALID_CODE_CODES.has(code)) {
    kind = 'invalid-code';
  } else if (
    failure.name === 'AuthRetryableFetchError' ||
    httpStatus === 0 ||
    error instanceof TypeError
  ) {
    kind = 'network';
  }
  return new AdminAuthError(kind, error);
}

/**
 * Classifies the error supabase-js reports for a sign-in link in the URL: an error fragment
 * (`AuthImplicitGrantRedirectError` — the link expired or was already used) or a rejected token is
 * `invalid-code`, a request that got no answer is `network`, anything else `unknown`.
 */
function linkErrorKind(error: unknown): AdminAuthErrorKind {
  const kind = toAdminAuthError(error).kind;
  if (kind === 'network') return 'network';
  const name = (error as { name?: unknown }).name;
  if (kind === 'invalid-code' || name === 'AuthImplicitGrantRedirectError') {
    return 'invalid-code';
  }
  return 'unknown';
}

/**
 * The URL the magic link returns to: the `admin` route under the app's base href, so production
 * gets `https://<host>/spotmap-website/admin` and the dev server `http://127.0.0.1:4200/admin`.
 * Every value it can produce must be in Supabase Auth's redirect allow-list.
 *
 * @param doc the app's document; only `baseURI` is read
 */
export function adminRedirectUrl(doc: Document): string {
  return new URL('admin', doc.baseURI).href;
}

/**
 * The maintainer's Supabase Auth session: email OTP sign-in (link plus 6-digit code), sign-out,
 * and whether the signed-in account is an admin. The answer is a convenience for routing only —
 * the database enforces `is_admin()` on every write.
 */
@Injectable({ providedIn: 'root' })
export class AdminSession {
  private readonly loadClient = inject(ADMIN_SUPABASE_LOADER);
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<AdminSessionState>({ status: 'loading' });
  private pendingReady: Promise<AdminSessionState> | null = null;

  /** The current sign-in state; updates on sign-in, sign-out and auth events from other tabs. */
  readonly state: Signal<AdminSessionState> = this.current.asReadonly();

  /**
   * Loads supabase-js, lets it consume a sign-in link in the URL, reads the stored session, asks
   * the database `is_admin()` and starts following auth events. Memoised: every caller shares one
   * run. A failed run is forgotten (state becomes signed out) so the next call retries.
   *
   * @returns the state the run settled on; read {@link state} for later changes
   * @throws AdminAuthError when the library, the session or the admin check cannot be loaded
   */
  ready(): Promise<AdminSessionState> {
    this.pendingReady ??= this.start().catch((error: unknown) => {
      this.pendingReady = null;
      this.current.set({ status: 'signed-out', linkError: null });
      throw toAdminAuthError(error);
    });
    return this.pendingReady;
  }

  /**
   * Mails a sign-in link and 6-digit code to an existing account; never creates one.
   *
   * @param email the address to send to; surrounding spaces are trimmed
   * @throws AdminAuthError when Supabase refuses or cannot be reached
   */
  async requestSignIn(email: string): Promise<void> {
    const client = await this.client();
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: adminRedirectUrl(this.document),
      },
    });
    if (error) throw toAdminAuthError(error);
  }

  /**
   * Signs in with the emailed code and settles {@link state} before resolving, so a navigation
   * right after it meets the new state in the guard.
   *
   * @param email the address the code went to
   * @param code the 6 digits from the email; surrounding spaces are trimmed
   * @throws AdminAuthError (`invalid-code` for a wrong or expired code)
   */
  async verifyCode(email: string, code: string): Promise<void> {
    await this.ready();
    const client = await this.client();
    const { data, error } = await client.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw toAdminAuthError(error);
    this.current.set(await this.resolveState(client, data.session));
  }

  /**
   * Ends the session (supabase-js revokes it and clears it from storage). On failure the session
   * is kept and the error says why.
   *
   * @throws AdminAuthError when the sign-out request fails
   */
  async signOut(): Promise<void> {
    const client = await this.client();
    const { error } = await client.auth.signOut();
    if (error) throw toAdminAuthError(error);
    this.current.set({ status: 'signed-out', linkError: null });
  }

  /** The shared supabase-js client, for the admin repository's RPC and Storage calls. */
  client(): Promise<SupabaseClient> {
    return this.loadClient();
  }

  /** The body of {@link ready}. */
  private async start(): Promise<AdminSessionState> {
    const client = await this.client();
    // initialize() hands back the URL-detection result that getSession() discards.
    const { error: callbackError } = await client.auth.initialize();
    const { data, error } = await client.auth.getSession();
    if (error) throw toAdminAuthError(error);
    const state = await this.resolveState(
      client,
      data.session,
      callbackError ? linkErrorKind(callbackError) : null,
    );
    this.current.set(state);
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      // supabase-js notifies while it holds its auth lock, and the is_admin request waits for
      // that lock: deferring lets the notification finish first.
      setTimeout(() => void this.follow(client, session), 0);
    });
    return state;
  }

  /**
   * Applies an auth event: a sign-out at once, a sign-in by a different account after a fresh
   * admin check. A failed check keeps the current state and warns.
   */
  private async follow(
    client: SupabaseClient,
    session: Session | null,
  ): Promise<void> {
    if (!session) {
      this.current.set({ status: 'signed-out', linkError: null });
      return;
    }
    const now = this.current();
    if (
      now.status === 'signed-in' &&
      now.email === (session.user.email ?? '')
    ) {
      return;
    }
    try {
      this.current.set(await this.resolveState(client, session));
    } catch (error) {
      console.warn('The maintainer check after a sign-in failed:', error);
    }
  }

  /**
   * Turns a session into a state, asking the database whether its user is an admin.
   *
   * @param linkError why a sign-in link in the URL failed, carried into the signed-out state
   */
  private async resolveState(
    client: SupabaseClient,
    session: Session | null,
    linkError: AdminAuthErrorKind | null = null,
  ): Promise<AdminSessionState> {
    if (!session) return { status: 'signed-out', linkError };
    const { data, error, status } = await client.rpc('is_admin');
    if (error) throw toAdminAuthError(error, status);
    return {
      status: 'signed-in',
      email: session.user.email ?? '',
      isAdmin: data === true,
    };
  }
}
