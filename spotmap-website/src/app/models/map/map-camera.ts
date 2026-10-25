/*
 * The camera vocabulary the map page and the map share. Neither component's folder owns it, so it
 * lives beside the other map models.
 */

/**
 * How many CSS pixels of the map each edge has covered by the page's own UI — on a phone, the
 * bottom sheet. The part left uncovered is what "in view" means, and where a selected pin is kept.
 */
export interface MapInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** A map nothing covers: the wide layout, whose column sits beside the map, not over it. */
export const NO_INSETS: MapInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** A camera to build a map on instead of the city's framing: a centre `[lng, lat]` and a zoom. */
export interface MapFocus {
  readonly center: [number, number];
  readonly zoom: number;
}

/**
 * Where the attribution control sits: bottom-right as MapLibre puts it, or top-right on the sheet
 * layout, where the sheet would otherwise cover a licence condition.
 */
export type AttributionCorner = 'bottom-right' | 'top-right';

/**
 * The zoom a cold `/spot/<id>` link opens its map at: close enough that the spot's photo pin has
 * room to show, and the same cap the city framing never zooms past.
 */
export const SPOT_FOCUS_ZOOM = 16;
