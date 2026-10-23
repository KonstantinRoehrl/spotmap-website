import type { LngLat } from '../../../../models/admin/admin-spot';
import {
  distanceMeters,
  POSITION_MATCH_MAX_M,
} from '../../../../services/admin/geo';
import type { ProcessedPhoto } from '../../../../services/admin/photo-pipeline/photo-pipeline';

/**
 * The create-or-attach flow's steps, in order: pick photos, process them, place the spot, check
 * for nearby spots, resolve (attach or create), save, and show the saved spot.
 */
export type CreateOrAttachStep =
  'pick' | 'processing' | 'place' | 'checking' | 'resolve' | 'saving' | 'done';

/**
 * A batch whose GPS guesses lie further apart than this is probably more than one spot, so the
 * place step warns and offers to drop photos. The duplicate check's radius: two photos further
 * apart than that could never both be "this spot".
 */
export const BATCH_SPREAD_WARN_M = POSITION_MATCH_MAX_M;

/** The picker's first guess: the GPS of the first photo in the batch that has one, else null. */
export function firstGuess(photos: readonly ProcessedPhoto[]): LngLat | null {
  return photos.find((photo) => photo.gps !== null)?.gps ?? null;
}

/**
 * The largest distance in metres between any two GPS guesses of the batch; 0 when fewer than two
 * photos have GPS. Photos without GPS take no part.
 */
export function batchSpreadM(photos: readonly ProcessedPhoto[]): number {
  const guesses = photos.flatMap((photo) => (photo.gps ? [photo.gps] : []));
  let spread = 0;
  for (let i = 0; i < guesses.length; i += 1) {
    for (let j = i + 1; j < guesses.length; j += 1) {
      spread = Math.max(spread, distanceMeters(guesses[i], guesses[j]));
    }
  }
  return spread;
}
