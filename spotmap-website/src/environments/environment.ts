import {
  PHOTO_BUCKET_PATH,
  SpotmapBackend,
} from '../app/services/spotmap-backend';

/** The local Supabase stack `npm run db:start` serves. */
const LOCAL_API_URL = 'http://127.0.0.1:54321';

/**
 * Development builds (`ng serve`, `ng build --configuration development`, Karma): the local
 * Supabase stack. Its publishable key is the CLI's fixed local default, not a secret. With the
 * stack down, the live request fails at once and the map falls back to the bundled snapshot.
 * angular.json swaps this file for environment.prod.ts in production builds.
 */
export const environment: { backend: SpotmapBackend } = {
  backend: {
    apiUrl: LOCAL_API_URL,
    publishableKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', // gitleaks:allow
    photoBaseUrl: `${LOCAL_API_URL}${PHOTO_BUCKET_PATH}`,
  },
};
