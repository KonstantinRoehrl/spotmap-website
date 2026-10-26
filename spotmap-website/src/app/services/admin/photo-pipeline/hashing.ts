import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/*
 * Content naming for uploaded photos. This uses @noble/hashes instead of crypto.subtle because
 * crypto.subtle is missing outside a secure context (a phone testing a LAN build over http) and is
 * async only. Only the lazy admin route tree imports this file (QC12).
 */

/**
 * The SHA-256 of some bytes.
 *
 * @param bytes the content, e.g. a full-size WebP's bytes
 * @returns 64 lowercase hex characters
 */
export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/**
 * The 8-hex content name of an object key: the first 8 hex of the SHA-256 of the full-size
 * rendition's bytes. Identical bytes always get the same name, so a retried upload lands on the
 * object already there.
 *
 * @param bytes the full-size WebP's bytes
 * @returns 8 lowercase hex characters
 */
export function contentHash8(bytes: Uint8Array): string {
  return sha256Hex(bytes).slice(0, 8);
}

/**
 * The bucket object key of a photo, the shape every key in the database has.
 *
 * @param city the spot's city slug, e.g. `vienna`
 * @param spotId the spot's final id, e.g. `hbf-curb-99f6e5`
 * @param hash8 {@link contentHash8} of the full-size rendition
 * @returns `<city>/<spot-id>-<hash8>.webp`; Storage holds it under `full/` and `thumb/`
 */
export function photoKey(city: string, spotId: string, hash8: string): string {
  return `${city}/${spotId}-${hash8}.webp`;
}
