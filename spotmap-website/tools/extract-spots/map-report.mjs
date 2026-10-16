/**
 * The per-map report of a map several cities share or one city uses as an extra map
 * (`data/spots/<map>.map-report.json`): which of its placemarks no city claims, and which several
 * cities claim, so a placemark a new town or a typo leaves behind is never dropped silently.
 * Only a run covering every city knows this; the CLI builds it only then. Pure: no I/O.
 */
import { describePlacemark } from './match.mjs';

/**
 * The maps that get a map report: each map some city uses as an extra map, and each map that is
 * the main map of more than one city.
 *
 * @param {Record<string, string>} maps `sources.json`'s `maps` (slug → mid)
 * @param {Record<string, { map: string, extraMaps?: string[] }>} cities `sources.json`'s `cities`
 * @returns {string[]} map slugs in registry order
 */
export function reportedMaps(maps, cities) {
  const configs = Object.values(cities);
  return Object.keys(maps).filter(
    (slug) =>
      configs.some(({ extraMaps = [] }) => extraMaps.includes(slug)) ||
      configs.filter(({ map }) => map === slug).length > 1,
  );
}

/**
 * Builds one map's report. A placemark is claimed by a city when it is one of the city's spots
 * (after its prefix filter) or matched, conflicting or ambiguous for it.
 *
 * @param {object} input
 * @param {string} input.map the map slug
 * @param {string} input.mid the map's My Maps id
 * @param {import('./kml.mjs').Placemark[]} input.placemarks every placemark of the map, in KML order
 * @param {Record<string, number[]>} input.claimsByCity per city using the map, in registry order,
 *   the ordinals it claims
 * @returns {{ report: object, warnings: string[] }}
 */
export function buildMapReport({ map, mid, placemarks, claimsByCity }) {
  const claimedBy = new Map();
  for (const [city, ordinals] of Object.entries(claimsByCity)) {
    for (const ordinal of new Set(ordinals)) {
      claimedBy.set(ordinal, [...(claimedBy.get(ordinal) ?? []), city]);
    }
  }
  const unclaimed = placemarks
    .filter(({ ordinal }) => !claimedBy.has(ordinal))
    .map(describePlacemark);
  const multiplyClaimed = placemarks
    .filter(({ ordinal }) => (claimedBy.get(ordinal)?.length ?? 0) > 1)
    .map((placemark) => ({
      ...describePlacemark(placemark),
      claimedBy: claimedBy.get(placemark.ordinal),
    }));
  const warnings = [
    ...unclaimed.map(
      ({ ordinal, name }) =>
        `${map}: placemark #${ordinal} "${name}" is claimed by no city`,
    ),
    ...multiplyClaimed.map(
      ({ ordinal, name, claimedBy: cities }) =>
        `${map}: placemark #${ordinal} "${name}" is claimed by ${cities.join(', ')}`,
    ),
  ];
  return {
    report: {
      map,
      mid,
      placemarks: placemarks.length,
      unclaimed,
      multiplyClaimed,
    },
    warnings,
  };
}
