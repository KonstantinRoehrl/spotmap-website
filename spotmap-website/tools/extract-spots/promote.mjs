#!/usr/bin/env node
/**
 * Promotes the extracted datasets into the files the app serves: data/spots/<city>.geojson →
 * public/spots/<city>.geojson, trimmed to what the map draws.
 *
 *   npm run promote:spots [-- <city>…]
 *
 * `extract:spots` promotes every city it writes. This re-promotes without touching the network:
 * every city in data/spots/sources.json, or only the named ones. data/spots/ stays the lossless
 * record. The served copy keeps each spot's geometry, id, name and status, and drops its source
 * records, notes and folders. An unknown city or flag exits 2 before anything is written. A city
 * whose dataset cannot be read or written is named, the others are still promoted, and the run
 * exits 1.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { writeFileAtomic } from './atomic.mjs';
import { toJsonText } from './dataset.mjs';

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** Where the extraction writes each city's lossless dataset, report and photos. */
export const SPOTS_DIR = join(APP_ROOT, 'data', 'spots');
/** Where the app loads each city's dataset from, as `spots/<city>.geojson` (base-relative). */
export const PUBLIC_SPOTS_DIR = join(APP_ROOT, 'public', 'spots');
/** The city registry: its `cities` keys are the cities this script can promote. */
const SOURCES_PATH = join(SPOTS_DIR, 'sources.json');

/**
 * The served copy of a city's dataset: every feature keeps its type and geometry, and its
 * properties shrink to `{ id, name, status, photos: [] }`, in that order. `photos` is emptied
 * because no photo host exists yet (Phase 6 changes this function to point at one). The input is
 * never mutated.
 *
 * @param {{ type: 'FeatureCollection', features: object[] }} collection a data/spots dataset
 * @returns {{ type: 'FeatureCollection', features: object[] }}
 */
export function promoteCollection({ type, features }) {
  return {
    type,
    features: features.map(
      ({ type: featureType, geometry, properties: { id, name, status } }) => ({
        type: featureType,
        geometry,
        properties: { id, name, status, photos: [] },
      }),
    ),
  };
}

/**
 * Reads `<spotsDir>/<city>.geojson` and writes its promoted copy to `<publicDir>/<city>.geojson`,
 * atomically and pretty-printed like the source.
 *
 * @param {string} city the `sources.json` key
 * @param {{ spotsDir?: string, publicDir?: string }} [dirs] injected for tests; the defaults are
 *   the app's real folders. `publicDir` must already exist.
 * @returns {Promise<void>}
 * @throws {Error} when the dataset cannot be read or parsed, or the copy cannot be written
 */
export async function promoteCity(
  city,
  { spotsDir = SPOTS_DIR, publicDir = PUBLIC_SPOTS_DIR } = {},
) {
  const collection = JSON.parse(
    await readFile(join(spotsDir, `${city}.geojson`), 'utf8'),
  );
  await writeFileAtomic(
    join(publicDir, `${city}.geojson`),
    toJsonText(promoteCollection(collection)),
  );
}

/**
 * Promotes the cities on the command line, or every city when none is named, and prints one line
 * per city. A failed city does not stop the run.
 *
 * @param {string[]} argv the arguments after the script name
 * @param {{ cities: string[], spotsDir?: string, publicDir?: string }} deps `cities` is
 *   `sources.json`'s city keys in registry order; the folders are injected for tests
 * @returns {Promise<0 | 1 | 2>} 0 when every city was promoted, 1 when any failed, 2 on bad
 *   arguments
 */
export async function runPromotion(
  argv,
  { cities, spotsDir = SPOTS_DIR, publicDir = PUBLIC_SPOTS_DIR },
) {
  let named;
  try {
    ({ positionals: named } = parseArgs({
      args: argv,
      allowPositionals: true,
    }));
  } catch (error) {
    console.error(`promote:spots: ${error.message}`);
    return 2;
  }
  const unknown = named.filter((city) => !cities.includes(city));
  if (unknown.length > 0) {
    console.error(
      `promote:spots: unknown city: ${unknown.join(', ')} (known: ${cities.join(', ')})`,
    );
    return 2;
  }

  const failed = [];
  for (const city of named.length > 0 ? [...new Set(named)] : cities) {
    try {
      await promoteCity(city, { spotsDir, publicDir });
      console.log(`${city}: promoted`);
    } catch (error) {
      failed.push(city);
      console.error(`${city}: ${error.message}`);
    }
  }
  if (failed.length > 0) {
    console.error(`promote:spots: failed: ${failed.join(', ')}`);
    return 1;
  }
  return 0;
}

/** Reads the registry's city list, runs the promotion, and sets the exit code. */
async function main() {
  const { cities } = JSON.parse(await readFile(SOURCES_PATH, 'utf8'));
  process.exitCode = await runPromotion(process.argv.slice(2), {
    cities: Object.keys(cities),
  });
}

if (import.meta.main) {
  await main();
}
