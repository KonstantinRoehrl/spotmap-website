import { SpotmapBackend } from '../app/services/spotmap-backend';

/**
 * Production builds (GitHub Pages). Empty until the rollout gate fills in the hosted EU project:
 * `apiUrl` and `publishableKey` from its API settings (the key line keeps a trailing
 * `// gitleaks:allow`, since the secret scan flags any committed key) and `photoBaseUrl` as
 * `${apiUrl}${PHOTO_BUCKET_PATH}`. Until then production serves the bundled snapshot and no
 * photos, exactly as before Phase 6.
 */
export const environment: { backend: SpotmapBackend } = {
  backend: { apiUrl: '', publishableKey: '', photoBaseUrl: '' },
};
