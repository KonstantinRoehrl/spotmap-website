import { InjectionToken } from '@angular/core';

/**
 * Where the live spot data and the photos come from: the Supabase project's API URL, its
 * publishable key and the base URL photo keys resolve under. The publishable key is public by
 * design — row-level security lets it read and nothing else — which is why it ships in the
 * bundle. Empty strings mean no backend is configured: the map serves the bundled snapshot only
 * and popups show no gallery, the site as it was before Phase 6.
 */
export interface SpotmapBackend {
  /** The project URL without a trailing slash, e.g. `https://<ref>.supabase.co`; empty when unconfigured. */
  apiUrl: string;
  /** The `sb_publishable_…` key, sent as the `apikey` header; empty when unconfigured. */
  publishableKey: string;
  /**
   * `${apiUrl}${PHOTO_BUCKET_PATH}`, the public bucket's root — the one value to change if the
   * photos move to another host (Cloudflare R2 is the documented escape hatch); empty when
   * unconfigured, which hides every gallery.
   */
  photoBaseUrl: string;
}

/** No backend: snapshot pins and no gallery. */
export const UNCONFIGURED_BACKEND: SpotmapBackend = {
  apiUrl: '',
  publishableKey: '',
  photoBaseUrl: '',
};

/**
 * The backend the app talks to. app.config.ts provides the build's environment value; anything
 * that does not — most specs — gets {@link UNCONFIGURED_BACKEND} and keeps the snapshot-only
 * behaviour. Unlike MAP_FACTORY this default is a plain value, so it drags no library into a spec
 * bundle.
 */
export const SPOTMAP_BACKEND = new InjectionToken<SpotmapBackend>(
  'SPOTMAP_BACKEND',
  { providedIn: 'root', factory: () => UNCONFIGURED_BACKEND },
);

/** The public `spot-photos` bucket's path under a Supabase project URL. */
export const PHOTO_BUCKET_PATH = '/storage/v1/object/public/spot-photos';

/** A photo's two renditions in the bucket: the 640 px thumbnail and the 1400 px original. */
export type PhotoSize = 'thumb' | 'full';

/**
 * The URL of one rendition of one photo.
 *
 * @param photoBaseUrl `SpotmapBackend.photoBaseUrl`; callers check it is non-empty
 * @param key an object key from `SpotProperties.photos`, e.g. `vienna/hbf-curb-99f6e5-9f98eefd.webp`
 * @param size which rendition
 * @returns `${photoBaseUrl}/${size}/${key}`
 */
export function photoUrl(
  photoBaseUrl: string,
  key: string,
  size: PhotoSize,
): string {
  return `${photoBaseUrl}/${size}/${key}`;
}
