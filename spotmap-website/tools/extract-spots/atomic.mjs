/**
 * Atomic file writes for the spot extraction tool.
 *
 * Every output — datasets, reports, encoded photos, the KML cache — is written beside its target
 * and renamed into place, so an interrupted run never leaves a truncated file that a later run
 * would trust (an existing `.webp` is the "already done" marker). The temporary name is unique
 * per process and per write, so overlapping writes to one target never share a temporary file.
 */
import { rename, rm, writeFile } from 'node:fs/promises';

let writeCount = 0;

/**
 * Writes `data` to a unique `<path>.<pid>.<n>.tmp`, then renames it over `path`. The parent
 * directory must exist. When the write or the rename fails, the temporary file is removed on a
 * best-effort basis and the original error is rethrown, so a failed write leaves no `.tmp`
 * beside its target. A killed process can still leave one behind.
 *
 * @param {string} path
 * @param {string | Uint8Array} data
 * @returns {Promise<void>}
 */
export async function writeFileAtomic(path, data) {
  const temporaryPath = `${path}.${process.pid}.${++writeCount}.tmp`;
  try {
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}
