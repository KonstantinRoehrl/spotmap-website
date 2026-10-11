/** A box as MapLibre takes it: `[[west, south], [east, north]]`, in degrees. */
export type LngLatBounds = [[number, number], [number, number]];

/**
 * How far from a city's median point a spot may be and still take part in framing the city. The
 * farthest spot of Linz, the most spread-out city the site has, is ~24 km from its median; the
 * strays that stretched Belgrade's and Zagreb's frames were ~68 km and ~54 km out.
 */
const FRAMING_RADIUS_KM = 30;

/** Kilometres in one degree of latitude, and of longitude at the equator. */
const KM_PER_DEGREE = 111.2;

/**
 * The box to open a city on: the tightest one holding every spot within {@link FRAMING_RADIUS_KM}
 * of the median point (the middle longitude and the middle latitude, which need not be any
 * spot's own position), or `null` for a city with no spots. A spot farther out is still drawn and
 * can be panned to — it just does not get to decide how far the map opens out. When no spot is
 * that close (a set split between two towns, whose median lies between them) there is no "city"
 * to frame, so every spot counts rather than none.
 *
 * Coordinates are `[longitude, latitude]` in degrees.
 */
export function framingBounds(
  coordinates: readonly (readonly [number, number])[],
): LngLatBounds | null {
  if (coordinates.length === 0) {
    return null;
  }
  const centreLng = median(coordinates.map(([lng]) => lng));
  const centreLat = median(coordinates.map(([, lat]) => lat));
  // Degrees of longitude shrink with latitude; at the city's own latitude is close enough here.
  const kmPerDegreeLng = KM_PER_DEGREE * Math.cos((centreLat * Math.PI) / 180);
  const nearby = coordinates.filter(
    ([lng, lat]) =>
      Math.hypot(
        (lng - centreLng) * kmPerDegreeLng,
        (lat - centreLat) * KM_PER_DEGREE,
      ) <= FRAMING_RADIUS_KM,
  );
  return tightestBox(nearby.length > 0 ? nearby : coordinates);
}

/** The middle value of `values` — the mean of the two middle ones for an even count. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** The tightest box holding every coordinate, of a non-empty list. */
function tightestBox(
  coordinates: readonly (readonly [number, number])[],
): LngLatBounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of coordinates) {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}
