#!/usr/bin/env node
/**
 * Exports the bundled snapshots from the database: rewrites public/spots/<city>.geojson — the
 * copy the app falls back to when the backend is down — with exactly what `city_spots(<city>)`
 * returns, with each feature's keys put back in the served order (PostgreSQL's jsonb hands object
 * keys back sorted, not as written), so the fallback follows the database. The maintainer runs it when they like and
 * commits the result; the fallback may lag the live map in between.
 *
 *   npm run snapshot:supabase [-- --hosted] [-- --city <slug>]…
 *
 * It writes every city that already has a snapshot, plus each `--city` given (a newly added
 * city). SUPABASE_URL and SUPABASE_SECRET_KEY come from the environment; the npm script loads
 * spotmap-website/.env.local first when it exists (see .env.example). The secret key bypasses
 * row-level security, which is why `city_spots()` filters soft-deleted spots itself. --hosted
 * must be given exactly when SUPABASE_URL is not the local stack, as for the sync. A city whose
 * read or write fails is named and keeps its previous snapshot; the others are still written.
 * Exits 0 when every city was written, 1 when any failed, 2 on bad arguments or environment.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { writeFileAtomic } from '../extract-spots/atomic.mjs';
import { toJsonText } from '../extract-spots/dataset.mjs';
import { PUBLIC_SPOTS_DIR } from '../extract-spots/paths.mjs';
import { isLocalUrl } from './cli.mjs';
import { createSupabaseClient, readCredentials } from './client.mjs';

/** A city slug, as `cities.slug` and the snapshot file names use it. */
const CITY_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** The extension of a snapshot file, after the city slug. */
const GEOJSON = '.geojson';
/**
 * The keys of a served feature's properties, as a set: the shape `city_spots()` answers, whatever
 * order jsonb gives them. The key order the snapshot is written in is {@link servedFeature}'s.
 */
const SERVED_KEYS = new Set(['id', 'name', 'status', 'notes', 'photos']);

/**
 * One `city_spots()` feature, rebuilt with its keys in the served order — type, geometry, then
 * `{ id, name, status, notes, photos }`, the order `committed-datasets.test.mjs` demands and
 * `served-record.mjs` builds. jsonb reorders object keys, so the answer's own order is not the
 * served one. Only Point features with exactly the served properties are accepted, so a change to
 * what `city_spots()` returns is caught here instead of being written into the snapshot.
 *
 * @param {any} feature one element of the answer's `features`
 * @returns {{ type: 'Feature', geometry: { type: 'Point', coordinates: number[] },
 *   properties: { id: string, name: string, status: string, notes: string | null,
 *   photos: string[] } }}
 * @throws {Error} when the feature is not a Point with exactly the served properties
 */
function servedFeature(feature) {
  const keys = Object.keys(feature?.properties ?? {});
  if (
    feature?.type !== 'Feature' ||
    feature.geometry?.type !== 'Point' ||
    !Array.isArray(feature.geometry.coordinates) ||
    keys.length !== SERVED_KEYS.size ||
    !keys.every((key) => SERVED_KEYS.has(key))
  ) {
    throw new Error('not the served shape');
  }
  const { id, name, status, notes, photos } = feature.properties;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: feature.geometry.coordinates },
    properties: { id, name, status, notes, photos },
  };
}

/**
 * Parses the export's flags.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ hosted: boolean, cities: string[] }} `cities` are the `--city` slugs, in the order
 *   given
 * @throws {TypeError} on an unknown flag or any positional argument
 * @throws {Error} on a `--city` value that is not a city slug
 */
export function parseSnapshotArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      hosted: { type: 'boolean', default: false },
      city: { type: 'string', multiple: true, default: [] },
    },
    allowPositionals: false,
  });
  for (const city of values.city) {
    if (!CITY_SLUG.test(city)) {
      throw new Error(`not a city slug: "${city}"`);
    }
  }
  return { hosted: values.hosted, cities: values.city };
}

/**
 * The cities that already have a snapshot in `publicDir`, sorted.
 *
 * @param {string} publicDir
 * @returns {Promise<string[]>}
 */
async function existingSnapshots(publicDir) {
  return (await readdir(publicDir))
    .filter((name) => name.endsWith(GEOJSON))
    .map((name) => name.slice(0, -GEOJSON.length))
    .sort();
}

/**
 * Runs the export. Every dependency is injected so the tests run it against a temporary folder
 * and a fake client.
 *
 * @param {string[]} argv the arguments after the script name
 * @param {{ env?: Record<string, string | undefined>,
 *   connect?: (credentials: { url: string, secretKey: string }) =>
 *     { rpc: (name: string, body: object) => Promise<any> },
 *   publicDir?: string, log?: (line: string) => void, error?: (line: string) => void }} deps
 *   `connect` builds the client (default {@link createSupabaseClient}); `publicDir` holds the
 *   snapshots (default public/spots/)
 * @returns {Promise<0 | 1 | 2>} 0 when every city was written, 1 when any failed, 2 on bad
 *   arguments, environment or target, before anything is read
 */
export async function runSnapshot(
  argv,
  {
    env = process.env,
    connect = createSupabaseClient,
    publicDir = PUBLIC_SPOTS_DIR,
    log = console.log,
    error = console.error,
  } = {},
) {
  let credentials;
  let cities;
  try {
    const flags = parseSnapshotArgs(argv);
    credentials = readCredentials(env);
    const local = isLocalUrl(credentials.url);
    const host = new URL(credentials.url).host;
    if (!local && !flags.hosted) {
      throw new Error(
        `${host} is not the local stack: pass --hosted to read from it`,
      );
    }
    if (local && flags.hosted) {
      throw new Error(`--hosted was given, but ${host} is the local stack`);
    }
    cities = [
      ...new Set([...(await existingSnapshots(publicDir)), ...flags.cities]),
    ].sort();
    if (cities.length === 0) {
      throw new Error(
        `no snapshot to export: ${publicDir} holds no <city>${GEOJSON}; name one with --city <slug>`,
      );
    }
    log(`target: ${host} (${local ? 'local stack' : 'hosted'})`);
  } catch (problem) {
    error(`snapshot:supabase: ${problem.message}`);
    return 2;
  }

  const client = connect({
    url: credentials.url,
    secretKey: credentials.secretKey,
  });
  const failed = [];
  for (const city of cities) {
    try {
      const collection = await client.rpc('city_spots', { p_city: city });
      if (
        collection?.type !== 'FeatureCollection' ||
        !Array.isArray(collection.features)
      ) {
        throw new Error(
          `city_spots(${city}) did not answer a FeatureCollection`,
        );
      }
      const features = collection.features.map((feature) => {
        try {
          return servedFeature(feature);
        } catch (problem) {
          throw new Error(
            `city_spots(${city}) answered a feature (${feature?.properties?.id ?? 'no id'}) that is ${problem.message}`,
          );
        }
      });
      await writeFileAtomic(
        join(publicDir, `${city}${GEOJSON}`),
        toJsonText({ type: 'FeatureCollection', features }),
      );
      log(`${city}: ${features.length} spots written`);
    } catch (problem) {
      failed.push(city);
      error(`${city}: FAILED — ${problem.message}`);
    }
  }
  if (failed.length > 0) {
    error(`snapshot:supabase: failed: ${failed.join(', ')}`);
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runSnapshot(process.argv.slice(2));
}
