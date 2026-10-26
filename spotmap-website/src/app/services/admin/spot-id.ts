import { sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import type { LngLat } from '../../models/admin/admin-spot';

/**
 * German letters, transliterated before the other diacritics are stripped
 * (`Grießkirchen` → `griesskirchen`).
 */
const GERMAN_LETTERS: Readonly<Record<string, string>> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

/**
 * Turns a name into a URL-safe slug exactly as tools/extract-spots/ids.mjs does: lower-case,
 * German letters transliterated (`ä→ae ö→oe ü→ue ß→ss`), other combining diacritics stripped,
 * every run of anything else collapsed to one `-`. Letters with no decomposition (`Ł`) drop out,
 * as they do there.
 *
 * @returns the slug, or `spot` when nothing sluggable is left
 */
export function slugify(text: string): string {
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
 * Builds a spot id the way the extractor does (ids.mjs `spotId`): the slugged name plus the first
 * 6 hex of SHA-1 over `"<lng>,<lat>"` rounded to 6 decimals, so same-named spots stay distinct.
 * SHA-1 comes from `@noble/hashes` because `crypto.subtle` is missing outside a secure context.
 * The database adds a `-2`, `-3` suffix when the id is taken (`admin_next_spot_id`).
 *
 * @param name the spot's display name
 * @param position the picked position
 */
export function spotId(name: string, position: LngLat): string {
  const coordinates = `${position.lng.toFixed(6)},${position.lat.toFixed(6)}`;
  const hash = bytesToHex(sha1(utf8ToBytes(coordinates))).slice(0, 6);
  return `${slugify(name)}-${hash}`;
}
