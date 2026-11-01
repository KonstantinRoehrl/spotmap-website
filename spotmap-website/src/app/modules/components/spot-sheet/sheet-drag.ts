import { SheetStop, SheetStops } from './spot-sheet-state';

/** How far a press on the handle or head moves before it is a drag and not a tap. */
export const SHEET_DRAG_SLOP_PX = 8;

/** The release speed in px/ms from which a release is a flick. */
const FLICK_PX_PER_MS = 0.5;

/** How much of the finger's recent path the release speed is measured over. */
const VELOCITY_WINDOW_MS = 100;

/** A finger still for longer than this before lifting has no release speed. */
const VELOCITY_PAUSE_MS = 80;

/** The stops, lowest first. */
const STOP_ORDER: readonly SheetStop[] = ['peek', 'half', 'full'];

/** One point of the finger's path. */
export interface DragSample {
  readonly y: number;
  readonly t: number;
}

/** Who a touch that started in the sheet's body belongs to, once it has moved. */
export type BodyTouchOwner = 'undecided' | 'sheet' | 'scroll' | 'none';

/** The finger's speed at release in px/ms, upward (the sheet growing) positive. */
export function releaseVelocity(
  samples: readonly DragSample[],
  now: number,
): number {
  const last = samples.at(-1);
  if (!last || now - last.t > VELOCITY_PAUSE_MS) {
    return 0;
  }
  const first = samples.find((sample) => sample.t >= now - VELOCITY_WINDOW_MS);
  if (!first || first === last) {
    return 0;
  }
  return (first.y - last.y) / (last.t - first.t);
}

/**
 * Where a release at `height` comes to rest. A flick goes to the next height in its direction from
 * where the sheet is now, so one flick moves one height. Anything slower goes to the nearest, so a
 * short drag eases back.
 */
export function settleStop(
  height: number,
  velocity: number,
  stops: SheetStops,
): SheetStop {
  if (velocity >= FLICK_PX_PER_MS) {
    return STOP_ORDER.find((stop) => stops[stop] > height) ?? 'full';
  }
  if (velocity <= -FLICK_PX_PER_MS) {
    return (
      [...STOP_ORDER].reverse().find((stop) => stops[stop] < height) ?? 'peek'
    );
  }
  return STOP_ORDER.reduce((nearest, stop) =>
    Math.abs(stops[stop] - height) < Math.abs(stops[nearest] - height)
      ? stop
      : nearest,
  );
}

/** `height` within the sheet's travel: no rubber-banding past either end. */
export function clampHeight(height: number, stops: SheetStops): number {
  return Math.min(Math.max(height, stops.peek), stops.full);
}

/** How far `height` has risen from half (0) to full (1). The gutters and bottom radii follow it. */
export function riseAt(height: number, stops: SheetStops): number {
  const travel = stops.full - stops.half;
  if (travel <= 0) {
    return 0;
  }
  return Math.min(Math.max((height - stops.half) / travel, 0), 1);
}

/**
 * Who owns a body touch, from its first move. A mostly horizontal move stays with the photo rail. Up
 * grows the sheet until it is full, and down takes the sheet only with the scroller at its top.
 * Anything else scrolls for the rest of the touch.
 */
export function decideBodyTouch(input: {
  readonly dx: number;
  readonly dy: number;
  readonly full: boolean;
  readonly atTop: boolean;
}): BodyTouchOwner {
  const { dx, dy, full, atTop } = input;
  if (dx === 0 && dy === 0) {
    return 'undecided';
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    return 'none';
  }
  if (dy < 0) {
    return full ? 'scroll' : 'sheet';
  }
  return atTop ? 'sheet' : 'scroll';
}

/**
 * The nearest ancestor of `target` inside `boundary` that really scrolls vertically. It asks for
 * overflowing content as well as an overflow style, because a horizontal rail's `overflow-x: auto`
 * computes its `overflow-y` to `auto` too.
 */
export function findScroller(
  target: Element,
  boundary: Element,
): Element | null {
  for (
    let element: Element | null = target;
    element && element !== boundary;
    element = element.parentElement
  ) {
    const overflow = getComputedStyle(element).overflowY;
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      element.scrollHeight > element.clientHeight
    ) {
      return element;
    }
  }
  return null;
}
