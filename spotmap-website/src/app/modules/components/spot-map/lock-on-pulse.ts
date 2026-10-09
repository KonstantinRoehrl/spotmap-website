import {
  IS_SELECTED,
  SELECTED_RING_RADIUS,
  SPOT_LOCK_ON_LAYER_ID,
} from './spot-layers';

/** How long the lock-on takes to close in on a newly selected pin. */
export const LOCK_ON_DURATION_MS = 450;

/** The radius, in px, the lock-on ring starts from before it closes onto the amber ring. */
export const LOCK_ON_START_RADIUS = 34;

/** The one map call the pulse makes, narrowed so specs can drive it with a fake. */
export interface LockOnMap {
  setPaintProperty(layerId: string, property: string, value: unknown): unknown;
}

/**
 * Marks the moment a pin is selected: the lock-on ring eases in from 34 px onto the amber ring
 * (cubic ease-out) while it fades out, then rests invisible. It paints the layer, not a feature —
 * the stroke opacity is gated on the `selected` feature state — so only the selected pin pulses
 * and no feature id is needed. Under reduced motion it does nothing at all.
 *
 * @returns a cancel that stops the pulse and puts the ring back to rest. The caller runs it when
 *   the selection clears, when another pin is selected, and before the map is torn down.
 */
export function startLockOn(
  map: LockOnMap,
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
    paintLockOn(map, progress);
    frame = progress < 1 ? requestAnimationFrame(step) : undefined;
  };
  // Painted now rather than a frame from now, so the ring is out the instant the pin is tapped.
  paintLockOn(map, 0);
  frame = requestAnimationFrame(step);
  return () => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    paintLockOn(map, 1);
  };
}

/** Paints the ring `progress` (0 to 1) of the way through its run; 1 is its resting state. */
function paintLockOn(map: LockOnMap, progress: number): void {
  const eased = 1 - (1 - progress) ** 3;
  map.setPaintProperty(
    SPOT_LOCK_ON_LAYER_ID,
    'circle-radius',
    LOCK_ON_START_RADIUS +
      (SELECTED_RING_RADIUS - LOCK_ON_START_RADIUS) * eased,
  );
  map.setPaintProperty(SPOT_LOCK_ON_LAYER_ID, 'circle-stroke-opacity', [
    'case',
    IS_SELECTED,
    1 - progress,
    0,
  ]);
}
