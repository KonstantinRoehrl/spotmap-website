/**
 * Matches an extra map's placemarks to a city's spots, so a map several cities share (Spotmap
 * Balkan) can add photos and source records to spots it holds too — without ever adding, moving
 * or renaming a spot: the city's main map stays authoritative.
 *
 * Pure: no I/O. A placemark is matched by its cleaned name first, then by position; anything that
 * cannot be matched unambiguously is reported, never guessed.
 */
import { cleanName, hasOwnPrefix } from './ids.mjs';

/** Mean Earth radius in metres, the sphere the haversine distance is computed on. */
const EARTH_RADIUS_M = 6_371_000;
/** A name match farther apart than this is a coordinate conflict. */
export const NAME_MATCH_MAX_M = 100;
/** How close a placemark must be to match a spot by position, or to break a tie of names. */
export const POSITION_MATCH_MAX_M = 25;

/**
 * A placemark merged into a spot. A merged conflict is one too.
 *
 * @typedef {object} Match
 * @property {string} spotId
 * @property {import('./kml.mjs').Placemark} placemark
 * @property {string} name the placemark's name cleaned with the city's own prefixes
 * @property {number} distanceM from the spot, in metres
 * @property {'name' | 'position'} via
 */

/**
 * A unique name match more than {@link NAME_MATCH_MAX_M} away. Merged only when the placemark
 * carries the city's own prefix, so an unprefixed common name cannot pull in another city's pin.
 *
 * @typedef {object} Conflict
 * @property {string} spotId
 * @property {import('./kml.mjs').Placemark} placemark
 * @property {string} name
 * @property {number} distanceM
 * @property {boolean} merged
 */

/**
 * A placemark with several candidate spots and no unique one within {@link POSITION_MATCH_MAX_M}.
 *
 * @typedef {object} Ambiguous
 * @property {import('./kml.mjs').Placemark} placemark
 * @property {string} name
 * @property {string[]} candidates spot ids
 */

/**
 * An own-prefixed placemark that matches no spot. Reported only, never added as a spot.
 *
 * @typedef {object} Unmatched
 * @property {import('./kml.mjs').Placemark} placemark
 * @property {string} name
 */

/**
 * The great-circle distance between two points (haversine).
 *
 * @param {[number, number]} from `[lng, lat]`
 * @param {[number, number]} to `[lng, lat]`
 * @returns {number} metres
 */
export function distanceMeters([lng1, lat1], [lng2, lat2]) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(toRadians(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(toRadians(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Matches every placemark of one extra map against a city's spots, in KML order:
 *
 * 1. Spots with the placemark's cleaned name are its name candidates. One within
 *    {@link NAME_MATCH_MAX_M} is a match; one farther away is a {@link Conflict}; of several, the
 *    unique one within {@link POSITION_MATCH_MAX_M} is a match, otherwise it is ambiguous.
 * 2. Without a name candidate, the unique spot within {@link POSITION_MATCH_MAX_M} is a match;
 *    several are ambiguous; none leaves an own-prefixed placemark unmatched and skips any other
 *    (it belongs to another city).
 * 3. A spot matched by several placemarks keeps every match, with a warning.
 *
 * @param {{ id: string, name: string, coordinates: [number, number] }[]} spots the city's spots
 *   from its main map
 * @param {import('./kml.mjs').Placemark[]} placemarks every placemark of the extra map
 * @param {string[]} ownPrefixes the city's `namePrefixes`
 * @returns {{ matches: Match[], conflicts: Conflict[], ambiguous: Ambiguous[], unmatched: Unmatched[], warnings: string[] }}
 */
export function matchExtraPlacemarks(spots, placemarks, ownPrefixes) {
  const matches = [];
  const conflicts = [];
  const ambiguous = [];
  const unmatched = [];
  for (const placemark of placemarks) {
    const name = cleanName(placemark.name, ownPrefixes);
    const distanceTo = (spot) =>
      distanceMeters(spot.coordinates, placemark.coordinates);
    const within = (candidates) =>
      candidates.filter((spot) => distanceTo(spot) <= POSITION_MATCH_MAX_M);
    const matchOf = (spot, via) => ({
      spotId: spot.id,
      placemark,
      name,
      distanceM: distanceTo(spot),
      via,
    });

    const byName = spots.filter((spot) => spot.name === name);
    if (byName.length === 1) {
      const [spot] = byName;
      const match = matchOf(spot, 'name');
      if (match.distanceM <= NAME_MATCH_MAX_M) {
        matches.push(match);
        continue;
      }
      const merged = hasOwnPrefix(placemark.name, ownPrefixes);
      conflicts.push({
        spotId: spot.id,
        placemark,
        name,
        distanceM: match.distanceM,
        merged,
      });
      if (merged) {
        matches.push(match);
      }
      continue;
    }
    const nearby = within(byName.length > 1 ? byName : spots);
    if (nearby.length === 1) {
      matches.push(matchOf(nearby[0], byName.length > 1 ? 'name' : 'position'));
    } else if (byName.length > 1 || nearby.length > 1) {
      const candidates = byName.length > 1 ? byName : nearby;
      ambiguous.push({
        placemark,
        name,
        candidates: candidates.map(({ id }) => id),
      });
    } else if (hasOwnPrefix(placemark.name, ownPrefixes)) {
      unmatched.push({ placemark, name });
    }
  }

  const countBySpot = new Map();
  for (const { spotId } of matches) {
    countBySpot.set(spotId, (countBySpot.get(spotId) ?? 0) + 1);
  }
  const warnings = [...countBySpot]
    .filter(([, count]) => count > 1)
    .map(
      ([spotId, count]) => `spot ${spotId} is matched by ${count} placemarks`,
    );
  return { matches, conflicts, ambiguous, unmatched, warnings };
}

/**
 * Everything a report keeps about a placemark it lists, so nothing about it is lost from the
 * record: its ordinal, raw name, position, folder and notes, and how many photos it links.
 *
 * @param {import('./kml.mjs').Placemark} placemark
 * @returns {{ ordinal: number, name: string, position: [number, number], folder?: string, description?: string, photoLinks: number }}
 */
export function describePlacemark({
  ordinal,
  name,
  coordinates,
  folder,
  description,
  mediaUrls,
}) {
  return {
    ordinal,
    name,
    position: coordinates,
    ...(folder !== undefined && { folder }),
    ...(description !== undefined && { description }),
    photoLinks: mediaUrls.length,
  };
}
