/**
 * Pure geometry that keeps a spot popup fully inside the visible part of the map. Everything is in
 * CSS pixels relative to the map's canvas host — the space `map.project()` returns and MapLibre
 * positions its popup container in. No DOM and no MapLibre, so every case is unit-tested.
 */

/** An axis-aligned box; x grows right and y grows down, as on screen. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A point on screen, in the same space as {@link Box}. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** The popup side that sits on the pin, in MapLibre's terms: `bottom` opens above the pin, `top` below. */
export type PopupAnchor = 'top' | 'bottom';

/** Kept clear between the popup and the edge of the visible map, so it never touches the frame. */
export const POPUP_FIT_MARGIN_PX = 16;

/** Wide enough for the photo gallery, narrow enough to leave the map readable behind it. */
export const POPUP_MAX_WIDTH_PX = 320;

/** The gallery squeezes no lower than this while the body below it still has room. */
export const GALLERY_MIN_HEIGHT_PX = 120;

/** The body kept visible below a squeezed gallery: one 44 px thumb row, so the name stays reachable. */
export const BODY_MIN_HEIGHT_PX = 44;

/** MapLibre's popup tip: a 10 px border triangle (maplibre-gl.css `.maplibregl-popup-tip`). */
export const POPUP_TIP_HEIGHT_PX = 10;

/** Set on the popup container: the tallest its content box may grow. */
export const POPUP_MAX_HEIGHT_VAR = '--spot-popup-max-height';

/** Set on the popup container: the gallery panel's height once fitted. */
export const GALLERY_HEIGHT_VAR = '--spot-popup-gallery-height';

/**
 * The fit box: the map frame intersected with the visual viewport, inset by `margin`, in the frame's
 * own coordinates. On a page scrolled so the frame is partly off screen it is the visible part.
 * Both inputs are client rectangles. A visible part thinner than the margins collapses to a line.
 */
export function fitBoxWithin(
  host: Box,
  viewport: Box,
  margin = POPUP_FIT_MARGIN_PX,
): Box {
  const left = Math.max(host.left, viewport.left) - host.left + margin;
  const top = Math.max(host.top, viewport.top) - host.top + margin;
  const right = Math.min(host.right, viewport.right) - host.left - margin;
  const bottom = Math.min(host.bottom, viewport.bottom) - host.top - margin;
  return {
    left,
    top,
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
  };
}

/**
 * The side and width a popup is created with, known before its content is measured: the side with
 * more room around the pin (a fixed anchor stops MapLibre flipping it while the camera moves), and
 * a width no wider than the fit box.
 */
export function popupFrame(
  box: Box,
  pin: ScreenPoint,
): { anchor: PopupAnchor; maxWidth: number } {
  return {
    anchor:
      roomOn('bottom', box, pin) >= roomOn('top', box, pin) ? 'bottom' : 'top',
    maxWidth: Math.min(POPUP_MAX_WIDTH_PX, box.right - box.left),
  };
}

/** What {@link fitPopup} needs: the fit box, the pin, and the popup as it laid out uncapped. */
export interface PopupFitInput {
  readonly box: Box;
  readonly pin: ScreenPoint;
  /** The popup container's laid-out width. */
  readonly width: number;
  /** The gallery panel at its natural 4:3 height, or 0 for a spot without photos. */
  readonly naturalGalleryHeight: number;
  /** Everything else in the content box — padding, border, gaps, text — at its natural height. */
  readonly naturalBodyHeight: number;
  /** On a re-fit, the side the popup already opened on; kept while it still has room. */
  readonly keepAnchor?: PopupAnchor;
}

/** How to show one popup: its side, its caps, whether its body scrolls, and the pan that frames it. */
export interface PopupFit {
  readonly anchor: PopupAnchor;
  readonly maxWidth: number;
  /** The tallest the content box may be: the fit box height less the tip. */
  readonly maxHeight: number;
  readonly galleryHeight: number;
  /** Whether the body still overflows the cap once the gallery has given way. */
  readonly scrolls: boolean;
  /** For `map.panBy()`, which moves the view by this — the content moves by its negation. */
  readonly panBy: [number, number];
}

/**
 * Fits a measured popup into the fit box: caps its height, squeezes the gallery before the body
 * scrolls, and works out the pan that brings popup, tip and pin fully inside.
 */
export function fitPopup(input: PopupFitInput): PopupFit {
  const { box, pin, naturalGalleryHeight: gallery } = input;
  const body = input.naturalBodyHeight;
  const frame = popupFrame(box, pin);
  const maxHeight = Math.max(0, box.bottom - box.top - POPUP_TIP_HEIGHT_PX);

  let galleryHeight = gallery;
  if (gallery + body > maxHeight) {
    // The gallery gives way first, down to its minimum — and below that only in a frame too short
    // to show one row of the body beside it, so the name and directions stay reachable.
    const floor = Math.min(
      gallery,
      GALLERY_MIN_HEIGHT_PX,
      Math.max(0, maxHeight - BODY_MIN_HEIGHT_PX),
    );
    galleryHeight = Math.max(floor, Math.min(gallery, maxHeight - body));
  }
  const scrolls = galleryHeight + body > maxHeight;
  const height = Math.min(galleryHeight + body, maxHeight);

  const keep = input.keepAnchor;
  const anchor =
    keep !== undefined && roomOn(keep, box, pin) >= height + POPUP_TIP_HEIGHT_PX
      ? keep
      : frame.anchor;

  const width = Math.min(input.width, frame.maxWidth);
  const top =
    anchor === 'bottom' ? pin.y - POPUP_TIP_HEIGHT_PX - height : pin.y;
  const bottom =
    anchor === 'bottom' ? pin.y : pin.y + POPUP_TIP_HEIGHT_PX + height;
  const shiftX = shiftInto(
    pin.x - width / 2,
    pin.x + width / 2,
    box.left,
    box.right,
  );
  const shiftY = shiftInto(top, bottom, box.top, box.bottom);
  return {
    anchor,
    maxWidth: frame.maxWidth,
    maxHeight,
    galleryHeight,
    scrolls,
    panBy: [whole(-shiftX), whole(-shiftY)],
  };
}

/** The room on the pin's side the popup would open on: above it for `bottom`, below it for `top`. */
function roomOn(anchor: PopupAnchor, box: Box, pin: ScreenPoint): number {
  return anchor === 'bottom' ? pin.y - box.top : box.bottom - pin.y;
}

/** How far a span must move to lie inside `[min, max]`; spans are never wider than the box here. */
function shiftInto(
  start: number,
  end: number,
  min: number,
  max: number,
): number {
  if (start < min) {
    return min - start;
  }
  if (end > max) {
    return max - end;
  }
  return 0;
}

/** Rounded to a whole pixel, with −0 folded into 0 so "no pan" compares equal. */
function whole(value: number): number {
  return Math.round(value) || 0;
}
