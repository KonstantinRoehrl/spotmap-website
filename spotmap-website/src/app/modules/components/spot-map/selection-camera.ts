import type { MapInsets } from '../../../models/map/map-camera';
import type { ViewBounds } from '../../../models/spots/spots-in-view';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { SELECTED_RING_RADIUS } from './spot-layers';

/** A rectangle on the map canvas, in canvas pixels from its top-left corner. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A point on the map canvas, in canvas pixels. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * What the camera keeps a selected pin visible in: the canvas size, the strips the page's own UI
 * covers (a phone's sheet), and how far the selected pin's flag reaches above it. On every layout
 * the camera moves only for a pin that is not already in view; a cold link's pin is the one it
 * always seats.
 */
export interface CameraFrame {
  readonly width: number;
  readonly height: number;
  readonly insets: MapInsets;
  /**
   * How far above the pin its flag reaches, in px; 0 for a pin that flies none. The flag counts as
   * part of the pin: it must be in view too, and when the pin is seated the pair is centred in the
   * rectangle, unless the rectangle is too short for that, when the pin and its ring win over the
   * flag.
   */
  readonly headroom: number;
}

/** How far inside the uncovered rectangle a pin must sit to count as visible, in px. */
export const KEEP_IN_VIEW_MARGIN_PX = 48;

/**
 * The clear space kept above a flag that reaches the top of the uncovered rectangle, in px: the
 * flag is the selection's whole mark, so it may not sit hard against the edge.
 */
export const FLAG_EDGE_GAP_PX = 8;

/**
 * How far from the pin's centre the selection must stay clear of the uncovered rectangle's edge,
 * in px: the amber ring's radius plus the same gap kept around the flag. A strip too short to
 * hold the pin and its ring on both sides of its centre gets the pin centred instead.
 */
export const SELECTED_PIN_REACH_PX = SELECTED_RING_RADIUS + FLAG_EDGE_GAP_PX;

/** The camera ease's length, the sheet's own height change, so a reveal and the sheet move together. */
export const CAMERA_EASE_MS = 330;

/** Reduced motion shortens the ease, never to a cut: a jump would lose the visitor's place. */
export const CAMERA_REDUCED_EASE_MS = 200;

/** The ease's curve: fast off the mark, settling gently on the pin. */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * The part of a `width` × `height` canvas the page's UI leaves uncovered. A cover taller or wider
 * than the canvas leaves an empty rectangle, never one turned inside out.
 */
export function uncoveredRect(
  width: number,
  height: number,
  insets: MapInsets,
): ScreenRect {
  return {
    left: insets.left,
    top: insets.top,
    right: Math.max(insets.left, width - insets.right),
    bottom: Math.max(insets.top, height - insets.bottom),
  };
}

/**
 * The offset, from the canvas centre, of `rect`'s centre: what MapLibre's `easeTo` takes as
 * `offset` to put its target there instead of in the middle of the whole canvas.
 */
export function offsetToRectCentre(
  width: number,
  height: number,
  rect: ScreenRect,
): [number, number] {
  return [
    (rect.left + rect.right) / 2 - width / 2,
    (rect.top + rect.bottom) / 2 - height / 2,
  ];
}

/**
 * Whether `point` lies inside `rect` by at least `margin` on every side — and, when a `topMargin`
 * is given, by at least that much from the top edge instead.
 */
export function containsPoint(
  rect: ScreenRect,
  point: ScreenPoint,
  margin: number,
  topMargin = margin,
): boolean {
  return (
    point.x >= rect.left + margin &&
    point.x <= rect.right - margin &&
    point.y >= rect.top + topMargin &&
    point.y <= rect.bottom - margin
  );
}

/** Whether two frames describe the same canvas, cover and flag reach. */
export function sameFrame(a: CameraFrame, b: CameraFrame): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.headroom === b.headroom &&
    a.insets.top === b.insets.top &&
    a.insets.right === b.insets.right &&
    a.insets.bottom === b.insets.bottom &&
    a.insets.left === b.insets.left
  );
}

/** The map calls the camera keeper makes, narrowed so specs can drive it with a fake. */
export interface CameraMap {
  project(lngLat: [number, number]): ScreenPoint;
  unproject(point: [number, number]): { lng: number; lat: number };
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  easeTo(options: {
    center: [number, number];
    zoom?: number;
    offset?: [number, number];
    duration: number;
    easing: (t: number) => number;
    essential: boolean;
  }): unknown;
}

/**
 * The geographic bounds of `rect`. Rotation and pitch are locked (SpotMapComponent's gesture
 * switches), so the top-left and bottom-right corners alone fix the box.
 */
export function boundsOfRect(
  map: Pick<CameraMap, 'unproject'>,
  rect: ScreenRect,
): ViewBounds {
  const northWest = map.unproject([rect.left, rect.top]);
  const southEast = map.unproject([rect.right, rect.bottom]);
  return {
    west: northWest.lng,
    north: northWest.lat,
    east: southEast.lng,
    south: southEast.lat,
  };
}

/**
 * Keeps one build's selected pin in view and puts the camera back when the spot closes. The view
 * an open started from is saved once and survives a switch to another spot, so closing returns to
 * where the visitor was browsing: the list is frozen while a detail is open. Nothing
 * moves while the visitor holds the map: a camera ease would take the drag from their finger.
 */
export class SelectionCamera {
  /** The view the first open started from; cleared once restored. */
  private saved?: { readonly center: [number, number]; readonly zoom: number };

  /**
   * @param map the build's map
   * @param isHeld whether the visitor has hold of the map (`PointerHold.isHeld`)
   */
  constructor(
    private readonly map: CameraMap,
    private readonly isHeld: () => boolean,
  ) {}

  /** A spot opened with nothing open before: saves the view, then keeps the pin in view. */
  open(pin: [number, number], frame: CameraFrame): void {
    if (!this.saved) {
      const { lng, lat } = this.map.getCenter();
      this.saved = { center: [lng, lat], zoom: this.map.getZoom() };
    }
    this.keepInView(pin, frame);
  }

  /**
   * Eases the pin into the uncovered rectangle's middle, but only when it is not already in view:
   * outside the rectangle less the margin, or with its flag cut off at the top. A pin the visitor can
   * already see keeps the camera still, on a phone as on a wide screen.
   */
  keepInView(pin: [number, number], frame: CameraFrame): void {
    if (this.isHeld() || this.inView(pin, frame)) {
      return;
    }
    this.seat(pin, frame, this.easeDuration());
  }

  /**
   * Seats the pin a build opened on in the uncovered rectangle's middle, without animation and
   * whether or not it is in view: a cold link's map is built centred on the spot, which on a phone is
   * under the sheet's top or behind it. Saves no view: there is none to go back to.
   */
  place(pin: [number, number], frame: CameraFrame): void {
    if (this.isHeld()) {
      return;
    }
    this.seat(pin, frame, 0);
  }

  /** The spot closed: eases back to the saved view, if one was saved and the camera left it. */
  restore(): void {
    const saved = this.saved;
    this.saved = undefined;
    if (!saved || this.isHeld()) {
      return;
    }
    const { lng, lat } = this.map.getCenter();
    if (
      lng === saved.center[0] &&
      lat === saved.center[1] &&
      this.map.getZoom() === saved.zoom
    ) {
      return;
    }
    this.map.easeTo({
      center: saved.center,
      zoom: saved.zoom,
      duration: this.easeDuration(),
      easing: easeOutCubic,
      essential: true,
    });
  }

  /**
   * Whether `pin` is in view: inside the uncovered rectangle by the margin, and far enough below its
   * top for the flag it flies, which reaches above it, to show whole as well.
   */
  private inView(pin: [number, number], frame: CameraFrame): boolean {
    const topMargin = Math.max(
      KEEP_IN_VIEW_MARGIN_PX,
      frame.headroom > 0 ? frame.headroom + FLAG_EDGE_GAP_PX : 0,
    );
    return containsPoint(
      uncoveredRect(frame.width, frame.height, frame.insets),
      this.map.project(pin),
      KEEP_IN_VIEW_MARGIN_PX,
      topMargin,
    );
  }

  /** Moves the camera so `pin` sits at its seat in the uncovered rectangle, over `duration` ms. */
  private seat(
    pin: [number, number],
    frame: CameraFrame,
    duration: number,
  ): void {
    const rect = uncoveredRect(frame.width, frame.height, frame.insets);
    // `essential`, because MapLibre otherwise turns every ease into a jump under reduced motion,
    // and the shortened ease already is the reduced-motion version.
    this.map.easeTo({
      center: pin,
      offset: this.seatOffset(frame, rect),
      duration,
      easing: easeOutCubic,
      essential: true,
    });
  }

  /**
   * Where the pin lands, as an offset from the canvas centre: the rectangle's middle, lowered by
   * half the flag's reach so the pin and its flag together are what sits in the middle. The
   * lowering stops where the pin's ring would reach the rectangle's bottom edge (the top of a
   * phone's sheet) and shrinks to nothing as the strip gets too short to hold the ring, so a
   * short strip keeps the pin visible at the cost of a clipped flag, and the seat moves
   * continuously with the strip's height.
   */
  private seatOffset(frame: CameraFrame, rect: ScreenRect): [number, number] {
    const [x, y] = offsetToRectCentre(frame.width, frame.height, rect);
    const room = (rect.bottom - rect.top) / 2 - SELECTED_PIN_REACH_PX;
    return [x, y + Math.min(frame.headroom / 2, Math.max(room, 0))];
  }

  /** The ease's length for the visitor's motion preference. */
  private easeDuration(): number {
    return prefersReducedMotion() ? CAMERA_REDUCED_EASE_MS : CAMERA_EASE_MS;
  }
}
