import { InjectionToken } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { SpotmapBackend } from '../spotmap-backend';

/**
 * The `localStorage` key supabase-js keeps the maintainer's session under. Named for this app so
 * it never collides with another Supabase client on the same origin (GitHub Pages serves several
 * sites from one host).
 */
export const ADMIN_AUTH_STORAGE_KEY = 'spotmap:admin-auth';

/** Resolves the one supabase-js client the admin pages share, importing the library on first call. */
export type AdminSupabaseLoader = () => Promise<SupabaseClient>;

/**
 * Declared without a default for the same reason as MAP_FACTORY (map-factory.token.ts): a token
 * carrying its own factory would pull supabase-js into every spec bundle that touches
 * AdminSession. app.config.ts registers {@link createAdminSupabaseLoader}; specs provide a fake
 * loader returning a hand-written client.
 */
export const ADMIN_SUPABASE_LOADER = new InjectionToken<AdminSupabaseLoader>(
  'ADMIN_SUPABASE_LOADER',
);

/**
 * Builds the loader app.config.ts registers. The first call imports `@supabase/supabase-js`
 * (dynamic `import()`, so the library lands in its own lazy chunk) and creates the client; every
 * later call returns that same client. A failed import is forgotten, so the next call retries
 * instead of replaying the failure.
 *
 * Auth runs the implicit flow because the magic link must work when it opens in another browser
 * than the one that asked for it (a phone mail app's in-app browser), which PKCE cannot do;
 * `detectSessionInUrl` lets the client read the session from the link's URL fragment.
 *
 * @param backend the build environment's Supabase project (`SPOTMAP_BACKEND`)
 */
export function createAdminSupabaseLoader(
  backend: SpotmapBackend,
): AdminSupabaseLoader {
  let pending: Promise<SupabaseClient> | null = null;
  return () => {
    pending ??= import('@supabase/supabase-js')
      .then(({ createClient }) =>
        createClient(backend.apiUrl, backend.publishableKey, {
          auth: {
            flowType: 'implicit',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
            storageKey: ADMIN_AUTH_STORAGE_KEY,
          },
        }),
      )
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
    return pending;
  };
}
