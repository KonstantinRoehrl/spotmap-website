/**
 * The served record of a spot: what the bundled snapshot (public/spots/<city>.geojson, written by
 * promote.mjs) and the live database (written by tools/sync-supabase) both carry, and what the
 * app reads as `SpotProperties` (src/app/models/spots/spot.ts). One builder for both, so the live
 * read and the snapshot it falls back to cannot drift apart in shape.
 */

/** A data/spots photo path, `spots/<city>/<file>.webp`; the capture is the object key. */
const DATASET_PHOTO_PATH = /^spots\/([a-z0-9-]+\/[^/]+\.webp)$/;

/**
 * The photo host's object key of a data/spots photo path: the path without its `spots/` prefix.
 * Storage serves it under `full/<key>` and `thumb/<key>`.
 *
 * @param {string} path e.g. `spots/vienna/hbf-curb-99f6e5-9f98eefd.webp`
 * @returns {string} e.g. `vienna/hbf-curb-99f6e5-9f98eefd.webp`
 * @throws {Error} on a path outside `spots/<city>/<file>.webp`
 */
export function photoObjectKey(path) {
  const key = DATASET_PHOTO_PATH.exec(path)?.[1];
  if (key === undefined) {
    throw new Error(`not a dataset photo path: "${path}"`);
  }
  return key;
}

/**
 * A spot's notes: the first description across its sources, in source order (the city's own map
 * first), that holds more than whitespace. Returned verbatim — notes are shown as written, so
 * they are neither trimmed nor merged; every spot whose notes sit on two maps carries the same
 * text on both.
 *
 * @param {{ description?: string }[]} sources the spot's `SpotSource` records
 * @returns {string | null} null when no source has notes
 */
export function notesOf(sources) {
  return (
    sources.find(({ description }) => description?.trim())?.description ?? null
  );
}

/**
 * The served record of a data/spots feature's properties, keys in served order. `notes` is
 * written as null rather than left out, because the live query writes null and the parity check
 * compares the two exactly. The input is never mutated.
 *
 * @param {{ id: string, name: string, status: 'active' | 'demolished', photos: string[],
 *   sources: { description?: string }[] }} properties a data/spots feature's properties
 * @returns {{ id: string, name: string, status: 'active' | 'demolished', notes: string | null,
 *   photos: string[] }}
 */
export function servedProperties({ id, name, status, photos, sources }) {
  return {
    id,
    name,
    status,
    notes: notesOf(sources),
    photos: photos.map(photoObjectKey),
  };
}
