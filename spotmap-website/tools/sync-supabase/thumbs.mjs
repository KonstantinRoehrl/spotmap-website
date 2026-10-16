/**
 * The thumbnail tree, data/thumbs/<city>/<file>.webp: the popup's 640 px renditions of the
 * encoded photos in data/spots/<city>/. A sibling tree on purpose, never a subfolder of a city's
 * photo folder: extract:spots deletes every entry of that folder its new dataset does not list,
 * so a thumb/ directory there would break the next extraction. Thumbnails are derived one at a
 * time — a first run takes a couple of minutes, every later run touches only what changed.
 */
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deriveThumbnail } from '../extract-spots/photos.mjs';

/**
 * Plans the tree: which thumbnails to (re)derive — missing, or older than their source, so a
 * `--reencode` reaches them — and which to delete because no photo references them any more.
 *
 * @param {{ spotsDir: string, thumbsDir: string, keys: string[] }} options `keys` are the
 *   payload's object keys; every source must exist (the sync checks that first)
 * @returns {Promise<{ stale: string[], orphans: string[] }>} `stale` in key order, `orphans`
 *   sorted, both as `<city>/<file>.webp`
 */
export async function planThumbnails({ spotsDir, thumbsDir, keys }) {
  const stale = [];
  for (const key of keys) {
    const source = await stat(join(spotsDir, key));
    const thumb = await stat(join(thumbsDir, key)).catch(() => null);
    if (thumb === null || thumb.mtimeMs < source.mtimeMs) {
      stale.push(key);
    }
  }

  const wanted = new Set(keys);
  const orphans = [];
  const cityFolders = await readdir(thumbsDir, { withFileTypes: true }).catch(
    () => [],
  );
  for (const folder of cityFolders.filter((entry) => entry.isDirectory())) {
    for (const name of await readdir(join(thumbsDir, folder.name))) {
      const key = `${folder.name}/${name}`;
      if (!wanted.has(key)) {
        orphans.push(key);
      }
    }
  }
  return { stale, orphans: orphans.sort() };
}

/**
 * Applies a plan from {@link planThumbnails}.
 *
 * @param {{ spotsDir: string, thumbsDir: string, plan: { stale: string[], orphans: string[] },
 *   derive?: (sourcePath: string, outPath: string) => Promise<void> }} options `derive` is
 *   injected for tests
 * @returns {Promise<{ derived: number, deleted: number }>}
 */
export async function applyThumbnails({
  spotsDir,
  thumbsDir,
  plan,
  derive = deriveThumbnail,
}) {
  for (const key of plan.stale) {
    const outPath = join(thumbsDir, key);
    await mkdir(dirname(outPath), { recursive: true });
    await derive(join(spotsDir, key), outPath);
  }
  for (const key of plan.orphans) {
    await rm(join(thumbsDir, key), { force: true });
  }
  return { derived: plan.stale.length, deleted: plan.orphans.length };
}
