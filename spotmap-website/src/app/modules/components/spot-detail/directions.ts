/**
 * The route to a spot, as a Google Maps URL rather than a `geo:` URI: iOS registers no handler for
 * `geo:`, so such a link is dead in Safari. This is the only single URL that reaches a native maps
 * app on both phone platforms, and where no app claims it the browser still lands on a usable
 * route. That fallback is a real top-level navigation, so the detail opens the link in a new
 * browsing context — an unhandled hand-off must never take the archive's map, selection and detail
 * down with it. The destination stays coordinates: the spot's name would be geocoded to whatever
 * it matches, which is not where the spot is.
 *
 * @param coordinates the spot's `[longitude, latitude]`
 * @returns `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`, the pair URL-encoded
 */
export function directionsUrl(coordinates: readonly [number, number]): string {
  const [lng, lat] = coordinates;
  const destination = encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
