/**
 * Parses a Google My Maps KML export into plain placemark records.
 *
 * Only what the datasets need is read: name, pin style, point, the folder path, the photo links in
 * the `gx_media_links` extended-data field and the `<description>` as plain-text notes (its
 * `<img>` elements repeat the photo links and are dropped). Anything that is
 * not a My Maps document — an HTML consent page answered with 200, a map gone private — throws,
 * so a bad download can never overwrite a city's dataset with nothing.
 */
import { XMLParser } from 'fast-xml-parser';

/**
 * One placemark as the export describes it.
 *
 * @typedef {object} Placemark
 * @property {number} ordinal 0-based position in this export's placemark order; names repeat, so
 *   this is what identifies a placemark within one export
 * @property {string} name the raw placemark name, e.g. `Wien: Hbf Curb`
 * @property {string} styleUrl e.g. `#icon-1899-0288D1-labelson`
 * @property {[number, number]} coordinates `[lng, lat]`
 * @property {string[]} mediaUrls photo links in `gx_media_links` order
 * @property {string} [folder] folder names, outermost first, joined by `" / "`; absent at the root
 * @property {string} [description] the notes as plain text; absent when empty
 */

// Tags that may occur once or many times; forcing lists keeps one code path for a map with a
// single folder (15 of the 16) and one with several.
const LIST_TAGS = new Set(['Folder', 'Placemark', 'Data']);
// CDATA arrives under this key, undecoded; plain text arrives as a decoded string. Notes need to
// know which one they hold to decode entities exactly once.
const CDATA = '__cdata';
const IMG_TAG = /<img\b[^>]*>/gi;
const BR_TAG = /<br\s*\/?>/gi;
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const parser = new XMLParser({
  isArray: (tagName) => LIST_TAGS.has(tagName),
  // Keep every value a string: a digits-only name must not become a number.
  parseTagValue: false,
  // `<Data name="gx_media_links">` is told apart by its attribute.
  ignoreAttributes: false,
  cdataPropName: CDATA,
});

/**
 * Parses a KML export into its placemarks: those directly under `<Document>` first, then each
 * folder's (folders nested in folders included), in document order. Each
 * placemark also carries its position (`ordinal`), folder path and plain-text notes.
 *
 * @param {string} text the KML document
 * @returns {Placemark[]}
 * @throws {Error} when the text is not a `<kml><Document>`, holds no placemarks, or a placemark
 *   has no readable point
 */
export function parseKml(text) {
  let parsed;
  try {
    parsed = parser.parse(text);
  } catch (error) {
    throw new Error(`not a KML document: ${error.message}`);
  }
  const kmlDocument = parsed?.kml?.Document;
  if (kmlDocument === undefined) {
    throw new Error('not a KML document: expected <kml><Document>');
  }
  const placemarks = collectPlacemarks(
    typeof kmlDocument === 'object' ? kmlDocument : {},
    [],
  ).map(({ node, folderPath }, ordinal) =>
    toPlacemark(node, folderPath, ordinal),
  );
  if (placemarks.length === 0) {
    throw new Error('KML document holds no placemarks');
  }
  return placemarks;
}

/**
 * Gathers a container's raw placemarks with the folder path each sits in: its own first, then
 * each folder's, recursing into nested folders, so document order is kept.
 *
 * @param {object} container the parsed `<Document>` or a `<Folder>`
 * @param {string[]} folderPath the names of the folders `container` sits in, outermost first
 * @returns {{ node: object, folderPath: string[] }[]}
 */
function collectPlacemarks(container, folderPath) {
  return [
    ...(container.Placemark ?? []).map((node) => ({ node, folderPath })),
    ...(container.Folder ?? []).flatMap((folder) => {
      const name = textOf(folder?.name).trim();
      return collectPlacemarks(
        folder ?? {},
        name === '' ? folderPath : [...folderPath, name],
      );
    }),
  ];
}

/**
 * Turns one raw parsed `<Placemark>` into a {@link Placemark}. Only the first two numbers of
 * the point are read (KML's `lng,lat[,alt]`); the photo links are every whitespace-separated
 * URL in the `gx_media_links` fields.
 *
 * @param {object} placemark the raw parsed `<Placemark>` node
 * @param {string[]} folderPath the folders it sits in, outermost first
 * @param {number} ordinal its position in the export's placemark order
 * @returns {Placemark}
 * @throws {Error} naming the placemark when its point is missing or not two finite numbers
 */
function toPlacemark(placemark, folderPath, ordinal) {
  const name = textOf(placemark.name).trim();
  const rawCoordinates = textOf(placemark.Point?.coordinates);
  if (rawCoordinates.trim() === '') {
    throw new Error(`placemark "${name}" has no Point coordinates`);
  }
  const [lng, lat] = rawCoordinates.trim().split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(
      `placemark "${name}" has unreadable coordinates "${rawCoordinates.trim()}"`,
    );
  }
  const mediaUrls = (placemark.ExtendedData?.Data ?? [])
    .filter((data) => data['@_name'] === 'gx_media_links')
    .flatMap((data) => textOf(data.value).split(/\s+/))
    .filter(Boolean);
  const folder = folderPath.join(' / ');
  const description = descriptionOf(placemark.description);
  return {
    ordinal,
    name,
    styleUrl: textOf(placemark.styleUrl),
    coordinates: [lng, lat],
    mediaUrls,
    ...(folder !== '' && { folder }),
    ...(description !== undefined && { description }),
  };
}

/**
 * Splits a parsed element into its text runs, marking which came from CDATA (undecoded) and
 * which were plain text (already decoded by the parser).
 *
 * @param {unknown} node a parsed element: a string, `{ '#text', __cdata }`, or absent
 * @returns {{ text: string, cdata: boolean }[]}
 */
function textParts(node) {
  if (node === undefined || node === null) {
    return [];
  }
  if (typeof node !== 'object') {
    return [{ text: String(node), cdata: false }];
  }
  return [
    ...[node['#text'] ?? []]
      .flat()
      .map((text) => ({ text: String(text), cdata: false })),
    ...[node[CDATA] ?? []]
      .flat()
      .map((text) => ({ text: String(text), cdata: true })),
  ];
}

/**
 * The text of a parsed element as written, plain or CDATA. CDATA is not decoded, which is how the
 * parser returned it before CDATA was told apart — so names, and the ids built from them, read
 * exactly as before.
 *
 * @param {unknown} node
 * @returns {string} `''` when the element is absent
 */
function textOf(node) {
  return textParts(node)
    .map(({ text }) => text)
    .join('');
}

/**
 * A placemark's `<description>` as plain text: `<img>` elements dropped (each repeats one of the
 * placemark's `gx_media_links` photos), `<br>` turned into a newline, entities decoded exactly
 * once, trailing spaces trimmed per line, three or more newlines collapsed to two, and the whole
 * trimmed. No other tag is stripped: the maps use none, and a note like `<3 spot` stays as typed.
 *
 * @param {unknown} node the parsed `<description>`
 * @returns {string | undefined} `undefined` when nothing is left
 */
function descriptionOf(node) {
  const text = textParts(node)
    .map(({ text: part, cdata }) => {
      const markupFree = part.replace(IMG_TAG, '').replace(BR_TAG, '\n');
      return cdata ? decodeEntities(markupFree) : markupFree;
    })
    .join('')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text === '' ? undefined : text;
}

/**
 * Decodes HTML entities in one pass, so `&amp;lt;` becomes `&lt;`, never `<`. Numeric
 * references and the named entities in {@link NAMED_ENTITIES} are decoded; anything else stays.
 *
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, body) => {
    if (body.startsWith('#')) {
      const codePoint =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }
    const name = body.toLowerCase();
    return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : entity;
  });
}
