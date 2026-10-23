#!/usr/bin/env node
/**
 * Inserts the spots the extraction found that the database has never seen. Once a spot is in
 * Supabase the maintainer tool owns it — it may be moved, renamed, re-photographed or deleted
 * there — so this sync never updates or deletes anything; it only adds what is new:
 *
 *   npm run sync:supabase [-- --dry-run] [-- --db-only] [-- --expect-no-inserts] [-- --hosted]
 *
 * SUPABASE_URL and SUPABASE_SECRET_KEY come from the environment; the npm script loads
 * spotmap-website/.env.local first when it exists (see .env.example). A run, each step only after
 * the previous one succeeded:
 *
 *   1. load every city of data/spots/sources.json;
 *   2. read every spot the database holds, deleted ones included, with sync_existing_spots();
 *   3. plan (insert-plan.mjs) and print the plan: a spot whose id is present is left alone; one
 *      near an existing spot, or of its exact name a little farther, is printed as a possible
 *      duplicate and held back for the maintainer; every other spot is inserted;
 *   4. check the photos of the spots to insert are on disk, derive their missing or outdated
 *      thumbnails into data/thumbs/ and delete thumbnails no dataset photo references any more;
 *   5. upload the photos of the spots to insert that the bucket lacks, stopping at the first
 *      failure (uploads already in flight finish, no further one starts);
 *   6. insert those spots, their photos and any new city with one sync_insert_spots() call — only
 *      now, so the live database never points at a missing file — and report its counts, all
 *      zero on a re-run with unchanged data.
 *
 * --dry-run stops after step 3 and writes nothing. --expect-no-inserts stops there too, writes
 * nothing, and exits 1 when the plan would insert anything (CI's re-run check). --db-only skips
 * steps 4 and 5, seeding the database from the committed datasets alone (CI); it is refused
 * against a hosted project, whose rows would point at photos never uploaded. --hosted must be
 * given exactly when SUPABASE_URL is not the local stack (127.0.0.1 or localhost), so a hosted
 * project is never written by accident. The target host is printed first. Exits 0 on success, 1
 * when a step fails (naming it), 2 on bad arguments or environment.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { APP_ROOT, SPOTS_DIR } from '../extract-spots/paths.mjs';
import { createLimiter } from '../extract-spots/photos.mjs';
import { createSupabaseClient, readCredentials } from './client.mjs';
import { planInserts } from './insert-plan.mjs';
import {
  buildPayload,
  loadDatasets,
  missingPhotos,
  photoKeysOf,
} from './payload.mjs';
import { listRemote, planUploads, remoteKeysOf } from './storage-plan.mjs';
import { applyThumbnails, planThumbnails } from './thumbs.mjs';

/** The derived thumbnails, data/thumbs/<city>/<file>.webp (gitignored, like the photos). */
export const THUMBS_DIR = join(APP_ROOT, 'data', 'thumbs');
/** Uploads in flight at once (see {@link runBounded}). */
const UPLOAD_CONCURRENCY = 6;
/** The hosts of the local Supabase stack (`npm run db:start`). */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/**
 * Runs `task` for every item, at most `concurrency` at a time, and stops at the first failure:
 * tasks still queued are never started, the ones in flight settle, and then that first error is
 * thrown. So nothing runs once the caller has reported the failure.
 *
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<void>} task
 * @returns {Promise<void>}
 * @throws {unknown} the first task failure, in the order the failures happened
 */
async function runBounded(items, concurrency, task) {
  const limit = createLimiter(concurrency);
  let failed = false;
  let firstFailure;
  await Promise.allSettled(
    items.map((item) =>
      limit(async () => {
        if (failed) {
          return;
        }
        try {
          await task(item);
        } catch (failure) {
          if (!failed) {
            failed = true;
            firstFailure = failure;
          }
        }
      }),
    ),
  );
  if (failed) {
    throw firstFailure;
  }
}

/**
 * Parses the sync's flags.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ dryRun: boolean, dbOnly: boolean, hosted: boolean, expectNoInserts: boolean }}
 * @throws {TypeError} on an unknown flag or any positional argument
 */
export function parseSyncArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean', default: false },
      'db-only': { type: 'boolean', default: false },
      hosted: { type: 'boolean', default: false },
      'expect-no-inserts': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  return {
    dryRun: values['dry-run'],
    dbOnly: values['db-only'],
    hosted: values.hosted,
    expectNoInserts: values['expect-no-inserts'],
  };
}

/**
 * Whether a project URL is the local Supabase stack.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isLocalUrl(url) {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

/**
 * Runs the sync. Every dependency is injected so the tests run it against temporary folders and a
 * fake client.
 *
 * @param {string[]} argv the arguments after the script name
 * @param {{ env?: Record<string, string | undefined>, cities: string[], spotsDir?: string,
 *   thumbsDir?: string, createClient?: typeof createSupabaseClient,
 *   derive?: (sourcePath: string, outPath: string) => Promise<void>,
 *   log?: (line: string) => void, error?: (line: string) => void }} deps `cities` is
 *   sources.json's city keys in registry order
 * @returns {Promise<0 | 1 | 2>}
 */
export async function runSync(
  argv,
  {
    env = process.env,
    cities,
    spotsDir = SPOTS_DIR,
    thumbsDir = THUMBS_DIR,
    createClient = createSupabaseClient,
    derive,
    log = console.log,
    error = console.error,
  },
) {
  let flags;
  let credentials;
  try {
    flags = parseSyncArgs(argv);
    credentials = readCredentials(env);
    const local = isLocalUrl(credentials.url);
    const host = new URL(credentials.url).host;
    if (!local && !flags.hosted) {
      throw new Error(
        `${host} is not the local stack: pass --hosted to write to it`,
      );
    }
    if (local && flags.hosted) {
      throw new Error(`--hosted was given, but ${host} is the local stack`);
    }
    if (!local && flags.dbOnly) {
      throw new Error(
        `--db-only is for the local stack only: ${host} is hosted, and its photos would be left unuploaded`,
      );
    }
    log(
      `target: ${host} (${local ? 'local stack' : 'hosted'})` +
        (flags.dryRun ? ', dry run' : '') +
        (flags.dbOnly ? ', database only' : '') +
        (flags.expectNoInserts ? ', expecting no inserts' : ''),
    );
  } catch (problem) {
    error(`sync:supabase: ${problem.message}`);
    return 2;
  }

  try {
    const payload = buildPayload(await loadDatasets({ spotsDir, cities }));
    const keys = photoKeysOf(payload);
    log(
      `load: ${payload.cities.length} cities, ${payload.spots.length} spots, ${keys.length} photos`,
    );

    let client;
    /** The client, created on first use: a run that fails before any network step builds none. */
    const connect = () =>
      (client ??= createClient({
        url: credentials.url,
        secretKey: credentials.secretKey,
      }));

    const existing = await connect().rpc('sync_existing_spots', {});
    const { inserts, alreadyPresent, possibleDuplicates } = planInserts(
      payload.spots,
      existing,
    );
    log(
      `plan: ${alreadyPresent.length} already present, ${possibleDuplicates.length} possible duplicates, ${inserts.length} to insert`,
    );
    for (const { id, duplicateOf, distanceM, reason } of possibleDuplicates) {
      log(
        `${id} possible duplicate of ${duplicateOf} (${reason}, ${distanceM.toFixed(1)} m)`,
      );
    }
    for (const { id, city } of inserts) {
      log(`insert: ${id} (${city})`);
    }

    if (flags.expectNoInserts) {
      if (inserts.length > 0) {
        throw new Error(
          `expected no inserts, but ${inserts.length} spots would be inserted`,
        );
      }
      log('expect no inserts: nothing to insert, nothing written');
      return 0;
    }
    if (flags.dryRun) {
      log('dry run: nothing written');
      return 0;
    }

    if (!flags.dbOnly) {
      // Only the photos of the spots to insert: a run that inserts one spot, or none, must not need
      // the whole library on disk.
      const insertKeys = photoKeysOf({ spots: inserts });
      const missing = missingPhotos(insertKeys, spotsDir);
      if (missing.length > 0) {
        throw new Error(
          `${missing.length} referenced photos are not on disk, e.g. data/spots/${missing[0]} — run npm run extract:spots`,
        );
      }

      // planThumbnails treats every thumbnail outside the keys it is given as an orphan, so the
      // thumbnails of the spots not inserted (whose sources may be absent) are kept out of its
      // orphan list: only a thumbnail no dataset photo references is deleted.
      const referenced = new Set(keys);
      const plan = await planThumbnails({
        spotsDir,
        thumbsDir,
        keys: insertKeys,
      });
      const { derived, deleted } = await applyThumbnails({
        spotsDir,
        thumbsDir,
        plan: {
          stale: plan.stale,
          orphans: plan.orphans.filter((key) => !referenced.has(key)),
        },
        ...(derive && { derive }),
      });
      log(`thumbnails: ${derived} derived, ${deleted} deleted`);

      const wanted = insertKeys.flatMap(remoteKeysOf);
      const insertCities = [...new Set(inserts.map(({ city }) => city))];
      const uploads = planUploads(
        wanted,
        await listRemote(connect(), insertCities),
      );
      await runBounded(uploads, UPLOAD_CONCURRENCY, async (remoteKey) => {
        const [size, ...rest] = remoteKey.split('/');
        const localPath = join(size === 'full' ? spotsDir : thumbsDir, ...rest);
        await connect().upload(remoteKey, await readFile(localPath));
      });
      log(`upload: ${uploads.length} of ${wanted.length} objects uploaded`);
    }

    const counts = await connect().rpc('sync_insert_spots', {
      payload: { cities: payload.cities, spots: inserts },
    });
    log(
      `database: ${counts.cities.inserted} cities, ${counts.spots.inserted} spots, ${counts.photos.inserted} photos inserted`,
    );
    return 0;
  } catch (failure) {
    error(`sync:supabase: ${failure.message}`);
    return 1;
  }
}

/** Reads the registry's city list, runs the sync, and sets the exit code. */
async function main() {
  const { cities } = JSON.parse(
    await readFile(join(SPOTS_DIR, 'sources.json'), 'utf8'),
  );
  process.exitCode = await runSync(process.argv.slice(2), {
    cities: Object.keys(cities),
  });
}

if (import.meta.main) {
  await main();
}
