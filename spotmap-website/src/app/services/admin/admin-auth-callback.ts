import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  provideAppInitializer,
} from '@angular/core';

import { AdminSession } from './admin-session';

/** A Supabase implicit-flow callback fragment: the session's `access_token`, or a failed link's `error_description`. */
const AUTH_CALLBACK_PARAM = /(^|[#&])(access_token|error_description)=/;

/**
 * Whether a URL fragment is a Supabase sign-in link's callback (success or error).
 *
 * @param hash `location.hash`, with or without the leading `#`
 */
export function isAuthCallback(hash: string): boolean {
  return AUTH_CALLBACK_PARAM.test(hash);
}

/**
 * Registers the app initializer that keeps a sign-in link's session from being lost. The implicit
 * flow returns the session in the URL fragment, and the app's routes redirect (`''` to the map,
 * `**` to home, the admin guard to sign-in), which would drop the fragment. The router's first
 * navigation starts only after every app initializer has settled, so when the URL is a callback
 * this one awaits {@link AdminSession.ready}, which lets supabase-js read and store the session
 * first. Any other URL resolves at once and never downloads supabase-js. A failure is warned and
 * swallowed here so the public site still starts; the sign-in page retries `ready()` and shows it.
 */
export function provideAdminAuthCallback(): EnvironmentProviders {
  return provideAppInitializer(() => {
    if (!isAuthCallback(inject(DOCUMENT).location.hash)) return;
    return inject(AdminSession)
      .ready()
      .then(
        () => undefined,
        (error: unknown) => {
          console.warn('The admin sign-in link could not be completed:', error);
        },
      );
  });
}
