#!/usr/bin/env node
/**
 * Checks the live database against the bundled snapshot: for every city, city_spots(city) must
 * deep-equal public/spots/<city>.geojson. The snapshot is what the frontend serves whenever the
 * backend is down, so the two must never disagree. Run after a sync:
 *
 *   npm run parity:supabase
 *
 * Reads SUPABASE_URL and SUPABASE_SECRET_KEY like sync:supabase, and only reads. When the optional
 * SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) is set too, the reads send that key instead, so
 * they pass through the gateway and row-level security exactly as the browser's do; CI sets it.
 * Without it the secret key reads, which bypasses row-level security. Exits 0 when every city
 * matches, 1 naming the first city and the first difference, 2 on bad arguments or environment.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PUBLIC_SPOTS_DIR, SPOTS_DIR } from '../extract-spots/promote.mjs';
import { createSupabaseClient, readCredentials } from './client.mjs';

/** The JSON kind of a value: null, array, object, or its typeof. */
function kindOf(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

/**
 * The first place two JSON values differ, depth first, object keys in sorted order.
 *
 * @param {unknown} actual the live answer
 * @param {unknown} expected the snapshot
 * @param {string} [path] the JSONPath of the values, `$` at the root
 * @returns {string | null} e.g. `$.features[3].properties.notes: "x" ≠ null`; null when equal
 */
export function firstDifference(actual, expected, path = '$') {
  const kind = kindOf(actual);
  if (kind !== kindOf(expected)) {
    return `${path}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`;
  }
  if (kind === 'array') {
    if (actual.length !== expected.length) {
      return `${path}: ${actual.length} items ≠ ${expected.length} items`;
    }
    for (let i = 0; i < actual.length; i++) {
      const difference = firstDifference(
        actual[i],
        expected[i],
        `${path}[${i}]`,
      );
      if (difference) return difference;
    }
    return null;
  }
  if (kind === 'object') {
    const keys = [
      ...new Set([...Object.keys(actual), ...Object.keys(expected)]),
    ].sort();
    for (const key of keys) {
      if (!(key in actual)) return `${path}.${key}: missing in the live answer`;
      if (!(key in expected)) return `${path}.${key}: missing in the snapshot`;
      const difference = firstDifference(
        actual[key],
        expected[key],
        `${path}.${key}`,
      );
      if (difference) return difference;
    }
    return null;
  }
  return Object.is(actual, expected)
    ? null
    : `${path}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`;
}

/**
 * Reads the optional publishable key from the environment.
 *
 * @param {Record<string, string | undefined>} env usually `process.env`
 * @returns {string | undefined} undefined when unset or empty
 * @throws {Error} when the value is not a publishable key; the message never echoes it
 */
function readPublishableKey(env) {
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    return undefined;
  }
  if (!key.startsWith('sb_publishable_')) {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY must be a publishable key (sb_publishable_…), not a secret key or a legacy JWT',
    );
  }
  return key;
}

/**
 * Runs the parity check over every city.
 *
 * @param {string[]} argv the arguments after the script name; none are accepted
 * @param {{ env?: Record<string, string | undefined>, cities: string[], publicDir?: string,
 *   createClient?: typeof createSupabaseClient, log?: (line: string) => void,
 *   error?: (line: string) => void }} deps
 * @returns {Promise<0 | 1 | 2>}
 */
export async function runParity(
  argv,
  {
    env = process.env,
    cities,
    publicDir = PUBLIC_SPOTS_DIR,
    createClient = createSupabaseClient,
    log = console.log,
    error = console.error,
  },
) {
  let client;
  try {
    parseArgs({ args: argv, options: {}, allowPositionals: false });
    const credentials = readCredentials(env);
    const publishableKey = readPublishableKey(env);
    log(
      `target: ${new URL(credentials.url).host} (reading as ${publishableKey ? 'the public, with the publishable key' : 'the secret key'})`,
    );
    client = createClient({
      ...credentials,
      ...(publishableKey && { publishableKey }),
    });
  } catch (problem) {
    error(`parity:supabase: ${problem.message}`);
    return 2;
  }

  for (const city of cities) {
    try {
      const snapshot = JSON.parse(
        await readFile(join(publicDir, `${city}.geojson`), 'utf8'),
      );
      const live = await client.rpc('city_spots', { p_city: city });
      const difference = firstDifference(live, snapshot);
      if (difference) {
        error(`${city}: ${difference}`);
        return 1;
      }
      log(`${city}: matches the snapshot (${snapshot.features.length} spots)`);
    } catch (failure) {
      error(`${city}: ${failure.message}`);
      return 1;
    }
  }
  return 0;
}

/** Reads the registry's city list, runs the check, and sets the exit code. */
async function main() {
  const { cities } = JSON.parse(
    await readFile(join(SPOTS_DIR, 'sources.json'), 'utf8'),
  );
  process.exitCode = await runParity(process.argv.slice(2), {
    cities: Object.keys(cities),
  });
}

if (import.meta.main) {
  await main();
}
