/**
 * Planning for the sync's upload and prune steps: which bucket objects to (re)upload and which
 * to delete. The comparison is by content — the local file's MD5 against the listing's eTag —
 * because a file name fingerprints Google's 32 px rendition, not the served bytes. The planners
 * are pure, so they are tested on plain data.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** The two renditions the bucket holds for every photo. */
const SIZES = ['full', 'thumb'];

/**
 * The bucket keys of one photo's two renditions.
 *
 * @param {string} objectKey `<city>/<file>.webp`
 * @returns {[string, string]} `[full/<objectKey>, thumb/<objectKey>]`
 */
export function remoteKeysOf(objectKey) {
  return [`full/${objectKey}`, `thumb/${objectKey}`];
}

/**
 * The MD5 of a file, as Storage reports a single-part upload's eTag.
 *
 * @param {string} path
 * @returns {Promise<string>} lower-case hex
 */
export async function md5Of(path) {
  return createHash('md5')
    .update(await readFile(path))
    .digest('hex');
}

/**
 * The bucket keys to upload: every wanted key the bucket lacks or holds with other bytes.
 *
 * @param {Map<string, string | null>} wanted bucket key → local MD5; null forces an upload (a
 *   thumbnail a dry run has not derived yet)
 * @param {Map<string, string | null>} remote bucket key → eTag, from {@link listRemote}
 * @returns {string[]} sorted
 */
export function planUploads(wanted, remote) {
  return [...wanted]
    .filter(([key, md5]) => md5 === null || remote.get(key) !== md5)
    .map(([key]) => key)
    .sort();
}

/**
 * The bucket keys nothing wants any more. The sync deletes them only after the database sync
 * succeeded, so the live database never points at a deleted file.
 *
 * @param {Set<string> | Map<string, unknown>} wanted the bucket keys the payload references
 * @param {Map<string, string | null>} remote bucket key → eTag
 * @returns {string[]} sorted
 */
export function planPrune(wanted, remote) {
  return [...remote.keys()].filter((key) => !wanted.has(key)).sort();
}

/**
 * Lists every object the sync owns: under `full/` and `thumb/`, each registered city's folder
 * plus every city folder found at the top level — so a city dropped from sources.json still has
 * its objects found and pruned. A stray object directly under `full/` or `thumb/` is listed too.
 *
 * @param {{ listFolder: (folder: string) => Promise<{ name: string, folder: boolean,
 *   eTag: string | null }[]> }} client
 * @param {string[]} cities the registered city slugs
 * @returns {Promise<Map<string, string | null>>} bucket key → eTag
 */
export async function listRemote(client, cities) {
  const remote = new Map();
  for (const size of SIZES) {
    const folders = new Set(cities);
    for (const entry of await client.listFolder(size)) {
      if (entry.folder) {
        folders.add(entry.name);
      } else {
        remote.set(`${size}/${entry.name}`, entry.eTag);
      }
    }
    for (const city of [...folders].sort()) {
      for (const entry of await client.listFolder(`${size}/${city}`)) {
        if (!entry.folder) {
          remote.set(`${size}/${city}/${entry.name}`, entry.eTag);
        }
      }
    }
  }
  return remote;
}
