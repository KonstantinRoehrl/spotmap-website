#!/usr/bin/env node
/**
 * Mirrors the extraction output into Supabase. Until the maintainer tool replaces Google My Maps
 * as the editing surface (roadmap Decision 1), the database is a re-runnable copy of data/spots/:
 *
 *   npm run sync:supabase [-- --dry-run] [-- --db-only] [-- --hosted]
 *
 * SUPABASE_URL and SUPABASE_SECRET_KEY come from the environment; the npm script loads
 * spotmap-website/.env.local first when it exists (see .env.example). A run, each step only after
 * the previous one succeeded:
 *
 *   1. load every city of data/spots/sources.json and check each referenced photo is on disk;
 *   2. derive missing or outdated thumbnails into data/thumbs/ and delete orphaned ones;
 *   3. upload every full/ and thumb/ object the bucket lacks or holds with other bytes;
 *   4. mirror the database with one sync_spots() call;
 *   5. delete the bucket objects nothing references any more — only now, so the live database
 *      never points at a deleted file;
 *   6. report each step's counts, all zero on a re-run with unchanged data.
 *
 * --dry-run plans every step and writes nothing. --db-only runs steps 1 (without the photo check)
 * and 4 only, seeding the database from the committed datasets alone (CI, the parity check).
 * --hosted must be given exactly when SUPABASE_URL is not the local stack (127.0.0.1 or
 * localhost), so a hosted project is never written by accident. The target host is printed
 * first. Exits 0 on success, 1 when a step fails (naming it), 2 on bad arguments or environment.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createLimiter } from '../extract-spots/photos.mjs';
import { SPOTS_DIR } from '../extract-spots/promote.mjs';
import { createSupabaseClient, readCredentials } from './client.mjs';
import {
  buildPayload,
  loadDatasets,
  missingPhotos,
  photoKeysOf,
} from './payload.mjs';
import {
  listRemote,
  md5Of,
  planPrune,
  planUploads,
  remoteKeysOf,
} from './storage-plan.mjs';
import { applyThumbnails, planThumbnails } from './thumbs.mjs';

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** The derived thumbnails, data/thumbs/<city>/<file>.webp (gitignored, like the photos). */
export const THUMBS_DIR = join(APP_ROOT, 'data', 'thumbs');
/** Uploads in flight at once. */
const UPLOAD_CONCURRENCY = 6;
/** The hosts of the local Supabase stack (`npm run db:start`). */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/**
 * Parses the sync's flags.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ dryRun: boolean, dbOnly: boolean, hosted: boolean }}
 * @throws {TypeError} on an unknown flag or any positional argument
 */
export function parseSyncArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean', default: false },
      'db-only': { type: 'boolean', default: false },
      hosted: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  return {
    dryRun: values['dry-run'],
    dbOnly: values['db-only'],
    hosted: values.hosted,
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
    log(
      `target: ${host} (${local ? 'local stack' : 'hosted'})` +
        (flags.dryRun ? ', dry run' : '') +
        (flags.dbOnly ? ', database only' : ''),
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
    let prune = [];

    if (!flags.dbOnly) {
      const missing = missingPhotos(keys, spotsDir);
      if (missing.length > 0) {
        throw new Error(
          `${missing.length} referenced photos are not on disk, e.g. data/spots/${missing[0]} — run npm run extract:spots`,
        );
      }

      const thumbPlan = await planThumbnails({ spotsDir, thumbsDir, keys });
      if (flags.dryRun) {
        log(
          `thumbnails: ${thumbPlan.stale.length} to derive, ${thumbPlan.orphans.length} to delete`,
        );
      } else {
        const { derived, deleted } = await applyThumbnails({
          spotsDir,
          thumbsDir,
          plan: thumbPlan,
          ...(derive && { derive }),
        });
        log(`thumbnails: ${derived} derived, ${deleted} deleted`);
      }

      // A dry run has not derived its stale thumbnails, so it counts them as uploads.
      const underived = new Set(flags.dryRun ? thumbPlan.stale : []);
      const wanted = new Map();
      for (const key of keys) {
        const [full, thumb] = remoteKeysOf(key);
        wanted.set(full, await md5Of(join(spotsDir, key)));
        wanted.set(
          thumb,
          underived.has(key) ? null : await md5Of(join(thumbsDir, key)),
        );
      }
      const remote = await listRemote(connect(), payload.cities);
      const uploads = planUploads(wanted, remote);
      if (flags.dryRun) {
        log(`upload: ${uploads.length} of ${wanted.size} objects to upload`);
      } else {
        const limit = createLimiter(UPLOAD_CONCURRENCY);
        await Promise.all(
          uploads.map((remoteKey) =>
            limit(async () => {
              const [size, ...rest] = remoteKey.split('/');
              const localPath = join(
                size === 'full' ? spotsDir : thumbsDir,
                ...rest,
              );
              await connect().upload(remoteKey, await readFile(localPath));
            }),
          ),
        );
        log(`upload: ${uploads.length} of ${wanted.size} objects uploaded`);
      }
      prune = planPrune(wanted, remote);
    }

    if (flags.dryRun) {
      log(
        `database: skipped (dry run), ${payload.spots.length} spots to mirror`,
      );
    } else {
      const { spots, photos } = await connect().rpc('sync_spots', { payload });
      log(
        `database: spots ${spots.inserted} inserted, ${spots.updated} updated, ${spots.deleted} deleted; ` +
          `photos ${photos.inserted} inserted, ${photos.deleted} deleted`,
      );
    }

    if (!flags.dbOnly) {
      if (flags.dryRun) {
        log(`prune: ${prune.length} objects to delete`);
      } else {
        await connect().remove(prune);
        log(`prune: ${prune.length} objects deleted`);
      }
    }
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
