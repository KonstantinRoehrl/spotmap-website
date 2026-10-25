/*
 * The phone top bar's sizing (spec §5.1): the cycling banner and the city picker share one row,
 * and the banner's slot widens to the line it is playing while the picker gives up room — never
 * below the width its own label needs. Widths are worked out rather than measured, so a line that
 * cannot fit is known before it plays. Every figure assumes IBM Plex Mono, whose glyphs all
 * advance 0.6 em.
 */

/** The phone top bar's banner size, px: the Display tier's small size. */
export const TOPBAR_BANNER_FONT_PX = 14;

/** The wide (and tablet) header row's banner size, px. */
export const HEADER_BANNER_FONT_PX = 20;

/** The gap between the top bar's banner and its picker, px (the item gap). */
export const TOPBAR_GAP_PX = 8;

/** The phone banner's resting line. */
export const RESTING_BANNER_LINE = 'SPOTMAP';

/** The picker's label size, px: the select's trigger text in Label type. */
const PICKER_LABEL_FONT_PX = 13;

/** The picker's ▾ arrow with its margin, px. */
const PICKER_ARROW_PX = 12;

/** The picker's padding on each side, px. */
const PICKER_SIDE_PADDING_PX = 12;

/** How many glyphs `text` sets: code points, so a character outside the BMP counts once. */
function glyphCount(text: string): number {
  return [...text].length;
}

/**
 * The width of `glyphs` monospace glyphs at `fontPx`, px: 0.6 em each, written as six tenths so a
 * whole-pixel width stays whole. In floating point 15 × 14 × 0.6 is 126.00000000000001, which
 * the ceilings below would round up to 127.
 */
function monoWidth(glyphs: number, fontPx: number): number {
  return (glyphs * fontPx * 6) / 10;
}

/**
 * The rendered width, px, of `line` (cursor included) in the banner at `fontPx`: what its slot
 * widens to. It matches the banner only with its dot gutters off (`[dotGutters]="false"`), which
 * is how the map page sets it.
 */
export function bannerSlotWidth(line: string, fontPx: number): number {
  return Math.ceil(monoWidth(glyphCount(line) + 1, fontPx));
}

/**
 * The narrowest the city picker may get with `label` showing unclipped: the label at 13 px, the
 * ▾ arrow and 12 px on each side, px. The page holds the picker at no less than this.
 */
export function pickerMinWidth(label: string): number {
  return Math.ceil(
    monoWidth(glyphCount(label), PICKER_LABEL_FONT_PX) +
      PICKER_ARROW_PX +
      2 * PICKER_SIDE_PADDING_PX,
  );
}

/**
 * The lines of `lines` whose slot fits beside the picker's minimum for `pickerLabel` in a bar
 * `barContentWidth` px wide (inside its padding), in their order. A line that would not fit at
 * that width is skipped there rather than clipped; the resting line is short enough to fit beside
 * every city's picker on a 320 px phone.
 */
export function fittingBannerLines(
  lines: readonly string[],
  barContentWidth: number,
  pickerLabel: string,
): string[] {
  const room = barContentWidth - TOPBAR_GAP_PX - pickerMinWidth(pickerLabel);
  return lines.filter(
    (line) => bannerSlotWidth(line, TOPBAR_BANNER_FONT_PX) <= room,
  );
}
