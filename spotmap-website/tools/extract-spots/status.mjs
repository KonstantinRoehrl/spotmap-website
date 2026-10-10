/**
 * Maps a Google My Maps placemark's pin colour to the site's spot status.
 *
 * Status follows the colour rather than the folder a placemark sits in, because folders and
 * colours disagree (Vienna's orange "Wien: Schönbrunn" sits in the "Wien" folder). A colour the
 * table does not know fails the city instead of guessing, so a new pin colour in My Maps is a
 * decision for a human, not a silent default.
 */

/**
 * Pin colour — the six-hex group of a placemark `styleUrl`, upper-case — to `SpotStatus`
 * (`src/app/models/spots/spot.ts`).
 */
export const STATUS_BY_COLOUR = Object.freeze({
  '0288D1': 'active',
  '3949AB': 'active',
  '006064': 'active',
  F57C00: 'demolished',
  '7CB342': 'unclassified',
});

// `#icon-1899-0288D1`, `#icon-1899-0288D1-labelson`, `#icon-1899-0288D1-nodesc`.
const PIN_COLOUR = /^#icon-\d+-([0-9A-F]{6})(?:-|$)/i;

/**
 * Returns the status a placemark's pin colour stands for.
 *
 * @param {string} styleUrl the placemark's `styleUrl`, e.g. `#icon-1899-0288D1-labelson`
 * @returns {'active' | 'demolished' | 'unclassified'}
 * @throws {Error} when the style carries no pin colour, or one outside {@link STATUS_BY_COLOUR}
 */
export function statusFor(styleUrl) {
  const colour = PIN_COLOUR.exec(styleUrl)?.[1]?.toUpperCase();
  if (!colour) {
    throw new Error(`no pin colour in styleUrl "${styleUrl}"`);
  }
  const status = STATUS_BY_COLOUR[colour];
  if (!status) {
    throw new Error(`unknown pin colour ${colour} (styleUrl "${styleUrl}")`);
  }
  return status;
}
