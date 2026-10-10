/**
 * Turns a city's parsed placemarks and photo outcomes into its committed outputs: the
 * `SpotCollection` GeoJSON the app reads (`src/app/models/spots/spot.ts`) and the run report.
 *
 * Everything here follows KML document order, never download-completion order, so concurrent
 * downloads cannot reorder the committed files. Nothing committed carries a photo URL: Google
 * rotates them on every export, so a URL would turn every re-run into a diff.
 */
import { assignIds, cleanName, spotId } from './ids.mjs';
import { statusFor } from './status.mjs';

/**
 * One photo link of a spot.
 *
 * @typedef {object} PhotoRef
 * @property {string} url the link from `gx_media_links` (rotates per export; never committed)
 * @property {number} index 1-based position in the placemark's `gx_media_links`
 */

/**
 * A placemark resolved to the site's spot model, before any photo is downloaded.
 *
 * @typedef {object} PreparedSpot
 * @property {string} id
 * @property {string} name the name with the city's own prefix stripped
 * @property {'active' | 'demolished' | 'unclassified'} status
 * @property {[number, number]} coordinates `[lng, lat]`
 * @property {PhotoRef[]} photos
 */

/**
 * What happened to one photo: encoded to `file` (now, or in an earlier run), or dead at the
 * source.
 *
 * @typedef {{ written: true, file: string, downloaded?: boolean } | { dead: true, reason: string }} PhotoOutcome
 */

/**
 * The key a photo's outcome is stored under.
 *
 * @param {string} spotId
 * @param {number} index the photo's 1-based position in its placemark
 * @returns {string} `<spotId>#<index>`
 */
export function photoKey(spotId, index) {
  return `${spotId}#${index}`;
}

/**
 * Resolves placemarks to spots: status from the pin colour, own prefix stripped, unique ids, and
 * every photo link numbered by its position.
 *
 * @param {import('./kml.mjs').Placemark[]} placemarks in KML order
 * @param {string[]} ownPrefixes the city's own name prefixes
 * @returns {{ spots: PreparedSpot[], warnings: string[] }}
 * @throws {Error} naming the placemark when its pin colour is unknown
 */
export function prepareSpots(placemarks, ownPrefixes) {
  const resolved = placemarks.map((placemark) => {
    let status;
    try {
      status = statusFor(placemark.styleUrl);
    } catch (error) {
      throw new Error(`placemark "${placemark.name}": ${error.message}`);
    }
    return {
      name: cleanName(placemark.name, ownPrefixes),
      status,
      coordinates: placemark.coordinates,
      mediaUrls: placemark.mediaUrls,
    };
  });
  const { ids, warnings } = assignIds(
    resolved.map(({ name, coordinates }) => spotId(name, coordinates)),
  );
  const spots = resolved.map(({ name, status, coordinates, mediaUrls }, i) => ({
    id: ids[i],
    name,
    status,
    coordinates,
    photos: mediaUrls.map((url, j) => ({ url, index: j + 1 })),
  }));
  return { spots, warnings };
}

/**
 * Builds a city's GeoJSON and run report. Written photos become base-relative paths
 * (`spots/<city>/<file>`, the `SpotProperties.photos` contract); dead ones are left out of the
 * GeoJSON and listed in the report by spot and position. A spot with no written photo is still
 * included.
 *
 * @param {object} input
 * @param {string} input.city the `CityEnum` value
 * @param {string} input.mid the My Maps map id
 * @param {PreparedSpot[]} input.spots from {@link prepareSpots}
 * @param {string[]} input.warnings from {@link prepareSpots}
 * @param {Map<string, PhotoOutcome>} input.outcomes keyed by {@link photoKey}
 * @returns {{ collection: object, report: object }}
 * @throws {Error} when a photo has no outcome
 */
export function buildCity({ city, mid, spots, warnings, outcomes }) {
  const photosDead = [];
  const spotsWithoutPhotos = [];
  const statusCounts = { active: 0, demolished: 0, unclassified: 0 };
  let photosLinked = 0;
  let photosWritten = 0;

  const features = spots.map((spot) => {
    const photos = [];
    for (const photo of spot.photos) {
      photosLinked++;
      const outcome = outcomes.get(photoKey(spot.id, photo.index));
      if (outcome?.written) {
        photos.push(`spots/${city}/${outcome.file}`);
        photosWritten++;
      } else if (outcome?.dead) {
        photosDead.push({
          spotId: spot.id,
          index: photo.index,
          reason: outcome.reason,
        });
      } else {
        throw new Error(
          `no download outcome for photo ${photo.index} of spot ${spot.id}`,
        );
      }
    }
    if (photos.length === 0) {
      spotsWithoutPhotos.push(spot.id);
    }
    statusCounts[spot.status]++;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: spot.coordinates },
      properties: { id: spot.id, name: spot.name, status: spot.status, photos },
    };
  });

  return {
    collection: { type: 'FeatureCollection', features },
    report: {
      city,
      mid,
      placemarks: spots.length,
      spotsWritten: features.length,
      photosLinked,
      photosWritten,
      photosDead,
      spotsWithoutPhotos,
      statusCounts,
      warnings,
    },
  };
}

/**
 * Serialises a committed output: 2-space JSON with a trailing newline, like the pilot's GeoJSON.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function toJsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
