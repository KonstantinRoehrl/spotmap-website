import {
  PHOTO_BUCKET_PATH,
  SpotmapBackend,
} from '../app/services/spotmap-backend';

/**
 * Production builds (GitHub Pages) talk to the hosted EU Supabase project. The publishable key is
 * public by design (row-level security lets it read and nothing else); its line keeps a trailing
 * `// gitleaks:allow`, since the secret scan flags any committed key. `photoBaseUrl` is
 * `${apiUrl}${PHOTO_BUCKET_PATH}`.
 */
const apiUrl = 'https://zrxqvlexcycaemaabulv.supabase.co';

export const environment: { backend: SpotmapBackend } = {
  backend: {
    apiUrl,
    publishableKey: 'sb_publishable_Dyedl3Vx4freI_bQUGi9-A_eFWestSz', // gitleaks:allow
    photoBaseUrl: `${apiUrl}${PHOTO_BUCKET_PATH}`,
  },
};
