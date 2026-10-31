/*
 * The wide layout's split between the map and the spot column: its limits, and the share of the
 * frame it is remembered as. Kept beside the handle whose limits these are: the handle only
 * reports widths, and the map page remembers them.
 */

/** The column's width before the visitor has moved the handle, in px. */
export const DEFAULT_COLUMN_WIDTH_PX = 384;

/** The narrowest the column may get, in px: the list rows and the detail's actions still fit. */
export const MIN_COLUMN_WIDTH_PX = 340;

/** One arrow-key step of the handle, in px. */
export const COLUMN_STEP_PX = 16;

/** One Shift + arrow step of the handle, in px. */
export const COLUMN_BIG_STEP_PX = 64;

/** The localStorage key holding the column's share of the frame, a number in (0, 0.5]. */
export const COLUMN_SHARE_STORAGE_KEY = 'spotColumnShare';

/**
 * The widest the column may get in a frame `frameWidth` px wide: half of it, never under the
 * minimum, so a frame too narrow for both limits keeps the column at its minimum.
 */
export function maxColumnWidth(frameWidth: number): number {
  return Math.max(MIN_COLUMN_WIDTH_PX, Math.floor(frameWidth / 2));
}

/** `width` held between MIN_COLUMN_WIDTH_PX and maxColumnWidth(frameWidth), rounded to whole px. */
export function clampColumnWidth(width: number, frameWidth: number): number {
  return Math.min(
    Math.max(Math.round(width), MIN_COLUMN_WIDTH_PX),
    maxColumnWidth(frameWidth),
  );
}

/**
 * The column's width for a stored `share` of the frame (`null`: nothing remembered, so
 * DEFAULT_COLUMN_WIDTH_PX), clamped. A share is what is remembered, so the two sides scale
 * together as the window resizes.
 */
export function columnWidthFor(
  share: number | null,
  frameWidth: number,
): number {
  return clampColumnWidth(
    share === null ? DEFAULT_COLUMN_WIDTH_PX : share * frameWidth,
    frameWidth,
  );
}

/**
 * The remembered share, or `null` when none is stored, the stored value is not a number in
 * (0, 0.5], or storage is unavailable.
 */
export function readColumnShare(): number | null {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(COLUMN_SHARE_STORAGE_KEY);
  } catch {
    // Private mode / blocked storage: nothing is remembered.
  }
  const share = stored === null ? NaN : Number(stored);
  return Number.isFinite(share) && share > 0 && share <= 0.5 ? share : null;
}

/** Remembers `share` for the next visit; storage that refuses the write is not an error. */
export function storeColumnShare(share: number): void {
  try {
    localStorage.setItem(COLUMN_SHARE_STORAGE_KEY, String(share));
  } catch {
    // Storage unavailable: the split just is not remembered.
  }
}

/** Forgets the remembered share (the double-click reset); storage that refuses is not an error. */
export function clearColumnShare(): void {
  try {
    localStorage.removeItem(COLUMN_SHARE_STORAGE_KEY);
  } catch {
    // Storage unavailable: there was nothing it could have kept.
  }
}
