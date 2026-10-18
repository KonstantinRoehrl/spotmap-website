import type { LngLat } from '../../models/admin/admin-spot';

/**
 * Mean Earth radius in metres, the sphere the haversine distance is computed on — the value
 * tools/extract-spots/match.mjs uses, so the browser and the extractor agree on every distance.
 */
export const EARTH_RADIUS_M = 6_371_000;

/**
 * Two spots this close are the same place: the admin tool's duplicate check, the sync's position
 * match and the batch-spread warning all use it (match.mjs's `POSITION_MATCH_MAX_M`).
 */
export const POSITION_MATCH_MAX_M = 25;

/** Same-named spots farther apart than this are different spots (match.mjs's `NAME_MATCH_MAX_M`). */
export const NAME_MATCH_MAX_M = 100;

/**
 * The great-circle distance between two points (haversine) — the same formula, operation for
 * operation, as `distanceMeters` in tools/extract-spots/match.mjs.
 *
 * @returns metres
 */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(toRadians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(toRadians(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
