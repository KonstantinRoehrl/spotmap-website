import type { UrlMatchResult, UrlSegment } from '@angular/router';

/** The positional route param that carries the spot id of `/spot/<id>`. */
export const SPOT_ID_PARAM = 'id';

/** `/spot/<id>` with one non-empty id segment, optionally followed by a query string or fragment. */
const SPOT_PATH = /^\/spot\/[^/?#]+(?:[?#].*)?$/;

/** `/map`, optionally followed by a query string or fragment. */
const MAP_PATH = /^\/map(?:[?#].*)?$/;

/**
 * Whether an app path is a spot link, `/spot/<id>`. The shell skips the welcome intro for one
 * (spec §4.6: a shared link goes straight to the spot).
 *
 * @param path a path as `Location.path()` or a router URL reports it, relative to the base href
 */
export function isSpotPath(path: string): boolean {
  return SPOT_PATH.test(path);
}

/**
 * Whether an app path shows the map page: `/map` or a spot link. The shell lets that page run
 * edge to edge instead of padding it like the other pages.
 *
 * @param path a path as `Location.path()` or a router URL reports it, relative to the base href
 */
export function isMapPagePath(path: string): boolean {
  return MAP_PATH.test(path) || isSpotPath(path);
}

/**
 * The route matcher for the map page: `map` and `spot/<id>`, the id handed over as the
 * {@link SPOT_ID_PARAM} positional param. One route config serves both URLs, and that is what
 * keeps the map alive between them. Angular's default `RouteReuseStrategy.shouldReuseRoute`
 * reuses the active component whenever the next route has the same `routeConfig`. Navigating
 * `/map` ↔ `/spot/<id>` therefore keeps the same `MapComponent` instance, and only its params
 * change. With two separate routes the page, and its WebGL map, would be rebuilt on every
 * open and close.
 */
export function matchMapPage(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 1 && segments[0].path === 'map') {
    return { consumed: segments };
  }
  if (segments.length === 2 && segments[0].path === 'spot') {
    return {
      consumed: segments,
      posParams: { [SPOT_ID_PARAM]: segments[1] },
    };
  }
  return null;
}
