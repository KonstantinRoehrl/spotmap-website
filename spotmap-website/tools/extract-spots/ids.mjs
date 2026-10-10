/**
 * Spot names, spot ids and photo file names for the extracted datasets.
 *
 * Ids must survive re-runs: a spot keeps its id as long as its cleaned name and coordinates do,
 * and a photo keeps its file name as long as its content does (Google rotates photo URLs on every
 * export, so a URL cannot name a photo). That is what lets a re-run skip every photo whose WebP
 * already exists without ever mistaking one photo for another.
 */
import { createHash } from 'node:crypto';

const GERMAN_LETTERS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * Strips one leading `<prefix>:` from a placemark name when the prefix is one of the city's own
 * (exact, case-sensitive match), then trims. A prefix naming another town stays.
 *
 * @param {string} name the placemark name, e.g. `Wien: Hbf Curb`
 * @param {string[]} ownPrefixes the city's own prefixes from `sources.json`
 * @returns {string}
 */
export function cleanName(name, ownPrefixes) {
  const trimmed = name.trim();
  const prefix = ownPrefixes.find((own) => trimmed.startsWith(`${own}:`));
  return prefix === undefined
    ? trimmed
    : trimmed.slice(prefix.length + 1).trim();
}

/**
 * Turns a name into a URL-safe slug the way the Vienna pilot did: lower-case, German letters
 * transliterated (`ä→ae ö→oe ü→ue ß→ss`), other diacritics stripped, every run of anything else
 * collapsed to one `-`.
 *
 * @param {string} text
 * @returns {string} the slug, or `spot` when nothing sluggable is left
 */
export function slugify(text) {
  const slug = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => GERMAN_LETTERS[letter])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'spot';
}

/**
 * Builds a spot id: the slugged name plus the first 6 hex of SHA-1 over the coordinates rounded
 * to 6 decimals, so same-named spots (several `Curbs`) stay distinct.
 *
 * @param {string} name the cleaned spot name
 * @param {[number, number]} coordinates `[lng, lat]`
 * @returns {string}
 */
export function spotId(name, [lng, lat]) {
  const hash = createHash('sha1')
    .update(`${lng.toFixed(6)},${lat.toFixed(6)}`)
    .digest('hex')
    .slice(0, 6);
  return `${slugify(name)}-${hash}`;
}

/**
 * Makes a city's ids unique by appending `-2`, `-3`, … to repeats, in input order.
 *
 * @param {string[]} baseIds ids from {@link spotId}, in KML order
 * @returns {{ ids: string[], warnings: string[] }} the unique ids and one warning per rename
 */
export function assignIds(baseIds) {
  const taken = new Set();
  const warnings = [];
  const ids = baseIds.map((base) => {
    let id = base;
    for (let suffix = 2; taken.has(id); suffix++) {
      id = `${base}-${suffix}`;
    }
    if (id !== base) {
      warnings.push(`duplicate spot id ${base} renamed to ${id}`);
    }
    taken.add(id);
    return id;
  });
  return { ids, warnings };
}

/**
 * Names a spot's encoded photo after its content: `<spotId>-<fingerprint>.webp`, where the
 * fingerprint is `photoFingerprint` (photos.mjs) of the photo's tiny rendition.
 *
 * @param {string} spotId
 * @param {string} fingerprint 8 hex
 * @returns {string}
 */
export function photoFileName(spotId, fingerprint) {
  return `${spotId}-${fingerprint}.webp`;
}
