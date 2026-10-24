import type { Map as MapLibreMap } from 'maplibre-gl';

// MapLibre internals named in this file were read in maplibre-gl 6.15.0.

/**
 * The MapLibre handlers a visitor moves the map through. Each reports itself active from the
 * moment a finger or button goes down or the wheel starts, before the camera has moved.
 *
 * The keyboard handler is left out: it never reports itself active (`KeyboardHandler.isActive`
 * returns a flag nothing sets), so an arrow key cannot be told from no input. Its ease replaces a
 * pan this component has just started instead, which loses nothing: the popup is revealed when the
 * key's ease ends.
 */
const GESTURE_HANDLERS = [
  'dragPan',
  'touchZoomRotate',
  'scrollZoom',
  'doubleClickZoom',
  'boxZoom',
] as const;

/**
 * Whether a MapLibre gesture handler is active. MapLibre stops a running ease the instant a
 * gesture handler turns active (`HandlerManager.handleEvent`) - firing that ease's `moveend`
 * synchronously, with `isMoving()` already false and no `movestart` of the gesture yet - so this is
 * the only way to tell that `moveend` from an ease running to its end.
 *
 * It is not enough to know a finger is down: `Map.resize()` on an idle map stops the camera, which
 * resets every handler (`Map.resize` → `Map.stop` → `Camera.stop` → `Camera._stopHandlers` →
 * `HandlerManager.stop`) while the finger stays where it is. {@link trackPointerHold} therefore
 * pairs this with the pointers it tracks itself.
 */
function isGestureActive(map: MapLibreMap): boolean {
  return GESTURE_HANDLERS.some((name) => map[name].isActive());
}

/** Whether the visitor holds one map, and the way to stop watching. */
export interface PointerHold {
  /**
   * Whether the visitor has hold of the map: a pointer is down on it, or a MapLibre gesture
   * handler is active. The pointer alone would miss a wheel zoom and the handler alone a resize,
   * which resets the handlers under a finger that has not moved.
   */
  isHeld(): boolean;
  /** Removes every listener the tracker added and forgets the pointers it saw. */
  stop(): void;
}

/**
 * Tracks the pointers down on `map`'s canvas container until {@link PointerHold.stop}. Their ends
 * are heard on the window, in the capture phase: a mouse button let go away from the map ends on
 * whatever is under it, and a touch the browser takes over for a scroll ends in `pointercancel`. A
 * context menu or a lost window focus may swallow the end altogether, so both let go of every
 * pointer rather than leave the map held for good.
 */
export function trackPointerHold(map: MapLibreMap): PointerHold {
  /**
   * The pointers currently down on the map's canvas container, by pointer id. Kept apart from
   * MapLibre's gesture handlers, which a resize resets under a resting finger: this is the fact
   * that a visitor holds the map, and it ends only when the pointer does.
   */
  const heldPointers = new Set<number>();
  const container = map.getCanvasContainer();
  const down = (event: PointerEvent) => heldPointers.add(event.pointerId);
  const up = (event: PointerEvent) => heldPointers.delete(event.pointerId);
  const releaseAll = () => heldPointers.clear();
  container.addEventListener('pointerdown', down);
  container.addEventListener('contextmenu', releaseAll);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  window.addEventListener('blur', releaseAll);
  return {
    isHeld: () => heldPointers.size > 0 || isGestureActive(map),
    stop: () => {
      container.removeEventListener('pointerdown', down);
      container.removeEventListener('contextmenu', releaseAll);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', releaseAll);
      heldPointers.clear();
    },
  };
}
