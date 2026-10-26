/*
 * The phone top bar's banner sizing: the cycling banner has the bar's whole content width on a row
 * of its own, so the only question left is which lines fit it. Widths are worked out rather than
 * measured, so a line that cannot fit is known before it plays. Every figure assumes IBM Plex Mono,
 * whose glyphs all advance 0.6 em.
 */

/** The phone top bar's banner size, px: the Display tier's small size. */
export const TOPBAR_BANNER_FONT_PX = 14;

/** The wide (and tablet) header row's banner size, px. */
export const HEADER_BANNER_FONT_PX = 20;

/** The phone banner's resting line. */
export const RESTING_BANNER_LINE = 'SPOTMAP';

/** How many glyphs `text` sets: code points, so a character outside the BMP counts once. */
function glyphCount(text: string): number {
  return [...text].length;
}

/**
 * The width of `glyphs` monospace glyphs at `fontPx`, px: 0.6 em each, written as six tenths so a
 * whole-pixel width stays whole. In floating point 15 × 14 × 0.6 is 126.00000000000001, which
 * the ceiling below would round up to 127.
 */
function monoWidth(glyphs: number, fontPx: number): number {
  return (glyphs * fontPx * 6) / 10;
}

/**
 * The rendered width, px, of `line` (cursor included) in the banner at `fontPx`. It matches the
 * banner only with its dot gutters off (`[dotGutters]="false"`), which is how the map page sets it.
 */
export function bannerLineWidth(line: string, fontPx: number): number {
  return Math.ceil(monoWidth(glyphCount(line) + 1, fontPx));
}

/**
 * The lines of `lines` that fit the bar's banner row, `barContentWidth` px wide (inside the bar's
 * padding), in their order. A line wider than the row is skipped rather than clipped; only a
 * screen narrower than the longest house line needs (about 310 px) skips any.
 */
export function fittingBannerLines(
  lines: readonly string[],
  barContentWidth: number,
): string[] {
  return lines.filter(
    (line) => bannerLineWidth(line, TOPBAR_BANNER_FONT_PX) <= barContentWidth,
  );
}
