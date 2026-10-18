import { ESRI_WORLD_IMAGERY } from '../app/services/admin/imagery';
import { PHOTO_BUCKET_PATH } from '../app/services/spotmap-backend';
import type { AppEnvironment } from './app-environment';

/**
 * Production builds (GitHub Pages) talk to the hosted EU Supabase project. The publishable key is
 * public by design (row-level security lets it read and nothing else); its line keeps a trailing
 * `// gitleaks:allow`, since the secret scan flags any committed key. `photoBaseUrl` is
 * `${apiUrl}${PHOTO_BUCKET_PATH}`. The admin picker draws Esri World Imagery; its
 * referrer-restricted key is never in this file — it lives in the hosted database's
 * `admin_settings`.
 */
const apiUrl = 'https://zrxqvlexcycaemaabulv.supabase.co';

export const environment: AppEnvironment = {
  backend: {
    apiUrl,
    publishableKey: 'sb_publishable_Dyedl3Vx4freI_bQUGi9-A_eFWestSz', // gitleaks:allow
    photoBaseUrl: `${apiUrl}${PHOTO_BUCKET_PATH}`,
  },
  imagery: ESRI_WORLD_IMAGERY,
};
