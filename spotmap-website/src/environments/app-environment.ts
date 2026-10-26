import type { ImageryConfig } from '../app/services/admin/imagery';
import type { SpotmapBackend } from '../app/services/spotmap-backend';

/**
 * What every build's environment file provides. environment.ts serves development and Karma;
 * angular.json swaps in environment.prod.ts for production builds. Nothing here is secret: the
 * publishable key is public by design, and the imagery key is read from the database after an
 * admin signs in.
 */
export interface AppEnvironment {
  /** The Supabase project the public map and the admin tool talk to. */
  backend: SpotmapBackend;
  /** The satellite imagery the admin picker draws. */
  imagery: ImageryConfig;
}
