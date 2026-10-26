/**
 * Planning for the sync's upload step: which bucket objects the spots it inserts still need. The
 * sync only ever adds spots the database has never seen, so presence is the whole comparison: an
 * object already in the bucket was put there by an earlier run that stopped before its insert, and
 * is not uploaded again. That is the planner's doing only: the storage client upserts, so an upload
 * that did run would be idempotent rather than refused. Nothing is ever deleted. The planner is
 * pure, so it is tested on plain data.
 */

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
 * The bucket keys to upload: every wanted key the bucket lacks.
 *
 * @param {string[]} wanted the bucket keys of the photos of the spots to insert
 * @param {Set<string>} remote the bucket keys present, from {@link listRemote}
 * @returns {string[]} sorted
 */
export function planUploads(wanted, remote) {
  return wanted.filter((key) => !remote.has(key)).sort();
}

/**
 * Lists the objects under `full/<city>/` and `thumb/<city>/` for each given city — the only
 * folders the spots to insert can have photos in. Sub-folders are skipped.
 *
 * @param {{ listFolder: (folder: string) => Promise<{ name: string, folder: boolean }[]> }} client
 * @param {string[]} cities the cities of the spots to insert
 * @returns {Promise<Set<string>>} the bucket keys present
 */
export async function listRemote(client, cities) {
  const remote = new Set();
  for (const size of SIZES) {
    for (const city of cities) {
      for (const entry of await client.listFolder(`${size}/${city}`)) {
        if (!entry.folder) {
          remote.add(`${size}/${city}/${entry.name}`);
        }
      }
    }
  }
  return remote;
}
