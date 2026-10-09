import type { FilterSpecification } from 'maplibre-gl';
import {
  LOCK_ON_AT_REST_FILTER,
  SELECTED_RING_RADIUS,
  SPOT_LOCK_ON_LAYER_ID,
} from './spot-layers';

/** How long the lock-on takes to close in on a newly selected pin. */
export const LOCK_ON_DURATION_MS = 450;

/** The radius, in px, the lock-on ring starts from before it closes onto the amber ring. */
export const LOCK_ON_START_RADIUS = 34;

/** The map calls the pulse makes, narrowed so specs can drive it with a fake. */
export interface LockOnMap {
  setPaintProperty(layerId: string, property: string, value: unknown): unknown;
  setFilter(layerId: string, filter: FilterSpecification): unknown;
}

/**
 * Marks the moment a pin is selected: the lock-on ring eases in from 34 px onto the amber ring
 * (cubic ease-out) while it fades out, then rests invisible. The ring's layer is filtered down to
 * the selected spot once, up front, and every frame after that only paints plain numbers. Under
 * reduced motion it does nothing at all.
 *
 * @param spotId the selected spot's `id` property, the one pin the ring closes in on.
 * @returns a cancel that stops the pulse and puts the ring back to rest. The caller runs it when
 *   the selection clears, when another pin is selected, and before the map is torn down.
 */
export function startLockOn(
  map: LockOnMap,
  spotId: string,
  { reducedMotion }: { readonly reducedMotion: boolean },
): () => void {
  if (reducedMotion) {
    return () => {};
  }
  let frame: number | undefined;
  let startedAt: number | undefined;
  const step = (now: number): void => {
    startedAt ??= now;
    const progress = Math.min((now - startedAt) / LOCK_ON_DURATION_MS, 1);
    if (progress < 1) {
      paintLockOn(map, progress);
      frame = requestAnimationFrame(step);
    } else {
      restLockOn(map);
      frame = undefined;
    }
  };
  // A filter or a feature-state expression is data-driven, so changing either makes MapLibre
  // re-lay-out every spot tile in its worker; it is set once per selection, never per frame.
  map.setFilter(SPOT_LOCK_ON_LAYER_ID, ['==', ['get', 'id'], spotId]);
  // Painted now rather than a frame from now, so the ring is out the instant the pin is tapped.
  paintLockOn(map, 0);
  frame = requestAnimationFrame(step);
  return () => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    restLockOn(map);
  };
}

/** Paints the ring `progress` (0 to 1) of the way through its run. */
function paintLockOn(map: LockOnMap, progress: number): void {
  const eased = 1 - (1 - progress) ** 3;
  map.setPaintProperty(
    SPOT_LOCK_ON_LAYER_ID,
    'circle-radius',
    LOCK_ON_START_RADIUS +
      (SELECTED_RING_RADIUS - LOCK_ON_START_RADIUS) * eased,
  );
  map.setPaintProperty(
    SPOT_LOCK_ON_LAYER_ID,
    'circle-stroke-opacity',
    1 - progress,
  );
}

/** Puts the ring at rest: closed onto the amber ring, invisible, and matching no pin. */
function restLockOn(map: LockOnMap): void {
  paintLockOn(map, 1);
  map.setFilter(SPOT_LOCK_ON_LAYER_ID, LOCK_ON_AT_REST_FILTER);
}
