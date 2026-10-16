/**
 * The sync_spots() payload (supabase/migrations/20261016000000_spots_and_photos.sql): every
 * city's spots as rows, built through the served-record builder so the database carries exactly
 * what the bundled snapshot carries, plus what only the database keeps — the city, the dataset
 * order, the coordinates and the lossless source records.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { servedProperties } from '../extract-spots/served-record.mjs';

/**
 * Reads each city's `<spotsDir>/<city>.geojson`.
 *
 * @param {{ spotsDir: string, cities: string[] }} options `cities` in registry order
 * @returns {Promise<{ city: string, collection: { features: object[] } }[]>} in that order
 * @throws {Error} when a dataset cannot be read or parsed
 */
export async function loadDatasets({ spotsDir, cities }) {
  return Promise.all(
    cities.map(async (city) => ({
      city,
      collection: JSON.parse(
        await readFile(join(spotsDir, `${city}.geojson`), 'utf8'),
      ),
    })),
  );
}

/**
 * One sync_spots() row.
 *
 * @typedef {object} SyncSpot
 * @property {string} id
 * @property {string} city
 * @property {number} sort_order the feature's index in its city's dataset
 * @property {string} name
 * @property {'active' | 'demolished'} status
 * @property {number} lng
 * @property {number} lat
 * @property {string | null} notes
 * @property {object[]} sources the lossless SpotSource records
 * @property {string[]} photos object keys, gallery order
 */

/**
 * Builds the payload. Spot ids must be unique across every city — the database keys spots by id
 * alone, so a collision would overwrite one city's spot with another's — and a collision fails
 * the sync instead.
 *
 * @param {{ city: string, collection: { features: object[] } }[]} datasets
 * @returns {{ cities: string[], spots: SyncSpot[] }}
 * @throws {Error} naming a repeated spot id and where it appears
 */
export function buildPayload(datasets) {
  const cityOf = new Map();
  const spots = [];
  for (const { city, collection } of datasets) {
    collection.features.forEach(({ geometry, properties }, sortOrder) => {
      const seenIn = cityOf.get(properties.id);
      if (seenIn !== undefined) {
        throw new Error(
          seenIn === city
            ? `spot id ${properties.id} appears twice in ${city}`
            : `spot id ${properties.id} appears in both ${seenIn} and ${city}`,
        );
      }
      cityOf.set(properties.id, city);
      const { id, name, status, notes, photos } = servedProperties(properties);
      const [lng, lat] = geometry.coordinates;
      spots.push({
        id,
        city,
        sort_order: sortOrder,
        name,
        status,
        lng,
        lat,
        notes,
        sources: properties.sources,
        photos,
      });
    });
  }
  return { cities: datasets.map(({ city }) => city), spots };
}

/**
 * Every photo object key the payload references.
 *
 * @param {{ spots: { photos: string[] }[] }} payload
 * @returns {string[]} in payload order
 */
export function photoKeysOf({ spots }) {
  return spots.flatMap(({ photos }) => photos);
}

/**
 * The referenced photos that are not on disk: an object key `<city>/<file>.webp` lives at
 * `<spotsDir>/<city>/<file>.webp`. The sync stops on any, before touching the network.
 *
 * @param {string[]} keys
 * @param {string} spotsDir data/spots
 * @returns {string[]}
 */
export function missingPhotos(keys, spotsDir) {
  return keys.filter((key) => !existsSync(join(spotsDir, key)));
}
