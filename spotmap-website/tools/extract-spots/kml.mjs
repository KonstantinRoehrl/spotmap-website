/**
 * Parses a Google My Maps KML export into plain placemark records.
 *
 * Only what the datasets need is read: name, pin style, point and the photo links in the
 * `gx_media_links` extended-data field. The `<description>` HTML is ignored. Anything that is
 * not a My Maps document — an HTML consent page answered with 200, a map gone private — throws,
 * so a bad download can never overwrite a city's dataset with nothing.
 */
import { XMLParser } from 'fast-xml-parser';

/**
 * One placemark as the export describes it.
 *
 * @typedef {object} Placemark
 * @property {string} name the raw placemark name, e.g. `Wien: Hbf Curb`
 * @property {string} styleUrl e.g. `#icon-1899-0288D1-labelson`
 * @property {[number, number]} coordinates `[lng, lat]`
 * @property {string[]} mediaUrls photo links in `gx_media_links` order
 */

// Tags that may occur once or many times; forcing lists keeps one code path for a map with a
// single folder (15 of the 16) and one with several.
const LIST_TAGS = new Set(['Folder', 'Placemark', 'Data']);

const parser = new XMLParser({
  isArray: (tagName) => LIST_TAGS.has(tagName),
  // Keep every value a string: a digits-only name must not become a number.
  parseTagValue: false,
  // `<Data name="gx_media_links">` is told apart by its attribute.
  ignoreAttributes: false,
});

/**
 * Parses a KML export into its placemarks: those directly under `<Document>` first, then each
 * folder's (folders nested in folders included), in document order.
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
  ).map(toPlacemark);
  if (placemarks.length === 0) {
    throw new Error('KML document holds no placemarks');
  }
  return placemarks;
}

/**
 * Gathers a container's raw placemarks: its own first, then each folder's, recursing into
 * nested folders, so document order is kept.
 *
 * @param {object} container the parsed `<Document>` or a `<Folder>`
 * @returns {object[]} the raw parsed `<Placemark>` nodes
 */
function collectPlacemarks(container) {
  return [
    ...(container.Placemark ?? []),
    ...(container.Folder ?? []).flatMap(collectPlacemarks),
  ];
}

/**
 * Turns one raw parsed `<Placemark>` into a {@link Placemark}. Only the first two numbers of
 * the point are read (KML's `lng,lat[,alt]`); the photo links are every whitespace-separated
 * URL in the `gx_media_links` fields.
 *
 * @param {object} placemark the raw parsed `<Placemark>` node
 * @returns {Placemark}
 * @throws {Error} naming the placemark when its point is missing or not two finite numbers
 */
function toPlacemark(placemark) {
  const name = String(placemark.name ?? '').trim();
  const rawCoordinates = placemark.Point?.coordinates;
  if (typeof rawCoordinates !== 'string' || rawCoordinates.trim() === '') {
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
    .flatMap((data) => String(data.value ?? '').split(/\s+/))
    .filter(Boolean);
  return {
    name,
    styleUrl: String(placemark.styleUrl ?? ''),
    coordinates: [lng, lat],
    mediaUrls,
  };
}
