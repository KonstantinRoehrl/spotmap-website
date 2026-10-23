import { InjectionToken } from '@angular/core';
import type { LngLat } from '../../../models/admin/admin-spot';

/**
 * Reads a photo's EXIF GPS position as the satellite picker's first guess. It resolves `null`
 * whenever no usable position exists and never rejects: most phone photos carry no GPS for the
 * web (iOS and Android strip it), and the picker then opens on the city centre with no error state
 * (spec decision 11). The position stays in memory only. It is never logged, uploaded or written
 * to the database (QC11).
 */
export type GpsReader = (file: Blob) => Promise<LngLat | null>;

/**
 * Turns exifr's GPS output into a position, or `null` when there is no usable one. Absent blocks,
 * non-finite or out-of-range values, and exactly 0/0 count as no position: 0/0 is what cameras
 * write when they have no fix, and no spot sits in the Gulf of Guinea.
 *
 * @param gps exifr's `{ latitude, longitude }` in decimal degrees, or `undefined`
 * @returns `{ lng, lat }` or `null`
 */
export function toLngLat(
  gps: { latitude: number; longitude: number } | undefined,
): LngLat | null {
  if (!gps) {
    return null;
  }
  const { latitude: lat, longitude: lng } = gps;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  if (lat === 0 && lng === 0) {
    return null;
  }
  return { lng, lat };
}

/**
 * The real {@link GpsReader}. It loads exifr's lite build on first use through a dynamic import,
 * so the EXIF reader stays out of every bundle but the admin chunk's lazy children (QC12).
 *
 * @param file the picked photo; JPEG and HEIC carry EXIF, anything else yields `null`
 */
export async function readGps(file: Blob): Promise<LngLat | null> {
  let exifr: typeof import('exifr/dist/lite.esm.mjs');
  try {
    exifr = await import('exifr/dist/lite.esm.mjs');
  } catch (error) {
    // The chunk failed to load (e.g. offline). Not fatal: the picker opens on the city centre.
    console.warn('Could not load the EXIF reader; no GPS first guess.', error);
    return null;
  }
  try {
    return toLngLat(await exifr.gps(file));
  } catch {
    // exifr throws on formats it cannot parse (PNG, WebP, …). For a first guess that only means
    // there is none, the common case, so nothing is logged.
    return null;
  }
}

/**
 * The GPS reader {@link PhotoPipeline} uses. It defaults to {@link readGps}; that is safe for
 * every spec bundle, because the library behind it is only reached through a dynamic import.
 * Specs that are not about EXIF provide a fake (QC4).
 */
export const GPS_READER = new InjectionToken<GpsReader>('GPS_READER', {
  providedIn: 'root',
  factory: () => readGps,
});
