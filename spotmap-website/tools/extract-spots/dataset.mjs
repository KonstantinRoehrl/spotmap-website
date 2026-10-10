/**
 * Turns a city's parsed placemarks and photo outcomes into its committed outputs: the
 * `SpotCollection` GeoJSON the app reads (`src/app/models/spots/spot.ts`) and the run report.
 *
 * A city's spots come from its main map; extra maps only add photos and source records to the
 * spots their placemarks matched. Photos are identified per map — by spot, map slug and number —
 * so photos added from an extra map never shift the numbers of the main map's photos.
 *
 * Everything here follows KML document order, never download-completion order, so concurrent
 * downloads cannot reorder the committed files. Nothing committed carries a photo URL: Google
 * rotates them on every export, so a URL would turn every re-run into a diff.
 */
import { assignIds, cleanName, spotId } from './ids.mjs';
import { describePlacemark } from './match.mjs';
import { hashDistance } from './photos.mjs';
import { statusFor } from './status.mjs';

/**
 * One photo link of a spot.
 *
 * @typedef {object} PhotoRef
 * @property {string} url the link from `gx_media_links` (rotates per export; never committed)
 * @property {string} map the slug of the map that links it
 * @property {number} n 1-based, across all of the spot's photos from that map in source order (for
 *   the main map, the position in its placemark's `gx_media_links`)
 */

/**
 * A placemark resolved to the site's spot model, before any photo is downloaded.
 *
 * @typedef {object} PreparedSpot
 * @property {string} id
 * @property {string} name the name with the city's own prefix stripped
 * @property {'active' | 'demolished' | 'unclassified'} status
 * @property {[number, number]} coordinates `[lng, lat]`
 * @property {number} ordinal the main-map placemark's ordinal
 * @property {PhotoRef[]} photos main-map photos first, then each extra map's
 * @property {object[]} sources one `SpotSource` (src/app/models/spots/spot.ts) per map record
 */

/**
 * What happened to one photo: encoded to `file` (now, or in an earlier run), or dead at the
 * source.
 *
 * @typedef {{ written: true, file: string, downloaded?: boolean } | { dead: true, reason: string }} PhotoOutcome
 */

/** An extra-map photo this close (in bits of 256) to a kept photo of another map is a near-duplicate. */
export const NEAR_DUPLICATE_MAX_DISTANCE = 10;

/** What counts as a URL in committed output. The word "Google" alone does not. */
export const URL_PATTERN =
  /https?:\/\/|\bwww\.|googleusercontent|google\.[a-z.]+\/|goo\.gl\//i;

/**
 * The key a photo's outcome is stored under.
 *
 * @param {string} spotId
 * @param {string} map the slug of the map that links the photo
 * @param {number} n the photo's {@link PhotoRef} number on that map
 * @returns {string} `<spotId>#<map>#<n>`
 */
export function photoKey(spotId, map, n) {
  return `${spotId}#${map}#${n}`;
}

/**
 * Resolves a city's main-map placemarks to spots: status from the pin colour, own prefix
 * stripped, unique ids, every photo link numbered, and the placemark's folder and notes kept as
 * the spot's first source record.
 *
 * @param {import('./kml.mjs').Placemark[]} placemarks in KML order
 * @param {string[]} ownPrefixes the city's own name prefixes
 * @param {string} map the main map's slug
 * @returns {{ spots: PreparedSpot[], warnings: string[] }}
 * @throws {Error} naming the placemark when its pin colour is unknown
 */
export function prepareSpots(placemarks, ownPrefixes, map) {
  const resolved = placemarks.map((placemark) => ({
    name: cleanName(placemark.name, ownPrefixes),
    status: statusOf(placemark),
    placemark,
  }));
  const { ids, warnings } = assignIds(
    resolved.map(({ name, placemark }) => spotId(name, placemark.coordinates)),
  );
  const spots = resolved.map(({ name, status, placemark }, i) => ({
    id: ids[i],
    name,
    status,
    coordinates: placemark.coordinates,
    ordinal: placemark.ordinal,
    photos: placemark.mediaUrls.map((url, j) => ({ url, map, n: j + 1 })),
    sources: [sourceOf(map, placemark)],
  }));
  return { spots, warnings };
}

/**
 * Adds one extra map's matches to the spots they matched: a source record per matched placemark
 * (its position always; its name and status only where they differ from the spot's) and its photo
 * links, numbered on from the spot's earlier photos of that map, so two placemarks on one spot
 * never collide. Geometry, id, name and status stay the main map's.
 *
 * @param {PreparedSpot[]} spots
 * @param {string} map the extra map's slug
 * @param {import('./match.mjs').Match[]} matches from `matchExtraPlacemarks`, in KML order
 * @returns {PreparedSpot[]} new spot objects where a match landed, the same objects elsewhere
 * @throws {Error} naming the placemark when its pin colour is unknown
 */
export function mergeExtraMatches(spots, map, matches) {
  const matchesBySpot = Map.groupBy(matches, ({ spotId }) => spotId);
  return spots.map((spot) => {
    const spotMatches = matchesBySpot.get(spot.id);
    if (spotMatches === undefined) {
      return spot;
    }
    const photos = [...spot.photos];
    const sources = [...spot.sources];
    let n = photos.filter((photo) => photo.map === map).length;
    for (const { placemark, name } of spotMatches) {
      const status = statusOf(placemark);
      sources.push({
        ...sourceOf(map, placemark),
        position: placemark.coordinates,
        ...(name !== spot.name && { name }),
        ...(status !== spot.status && { status }),
      });
      for (const url of placemark.mediaUrls) {
        photos.push({ url, map, n: ++n });
      }
    }
    return { ...spot, photos, sources };
  });
}

/**
 * Turns one extra map's unresolved match results into report entries that keep the full
 * placemark record and name the map.
 *
 * @param {string} map the extra map's slug
 * @param {PreparedSpot[]} spots the city's spots (for a conflict's main position)
 * @param {{ conflicts: import('./match.mjs').Conflict[], ambiguous: import('./match.mjs').Ambiguous[], unmatched: import('./match.mjs').Unmatched[] }} result
 * @returns {{ conflicts: object[], ambiguous: object[], unmatched: object[] }}
 */
export function reportMatchEntries(
  map,
  spots,
  { conflicts, ambiguous, unmatched },
) {
  const coordinatesById = new Map(
    spots.map(({ id, coordinates }) => [id, coordinates]),
  );
  return {
    conflicts: conflicts.map(({ spotId, placemark, distanceM, merged }) => ({
      map,
      spotId,
      ...describePlacemark(placemark),
      distanceM: Math.round(distanceM),
      merged,
      positions: {
        main: coordinatesById.get(spotId),
        extra: placemark.coordinates,
      },
    })),
    ambiguous: ambiguous.map(({ placemark, candidates }) => ({
      map,
      ...describePlacemark(placemark),
      candidates,
    })),
    unmatched: unmatched.map(({ placemark }) => ({
      map,
      ...describePlacemark(placemark),
    })),
  };
}

/**
 * Builds a city's GeoJSON and run report. Written photos become base-relative paths
 * (`spots/<city>/<file>`, the `SpotProperties.photos` contract); dead ones are left out of the
 * GeoJSON and listed in the report by spot, map and number. Per spot, in source order, a written
 * photo whose file equals a kept one is an exact duplicate; an extra-map photo within
 * {@link NEAR_DUPLICATE_MAX_DISTANCE} bits of a kept photo of another map is a near-duplicate
 * (the earlier, so the main map's, copy wins); both are left out of the GeoJSON and reported.
 * A spot's dead main-map photos count as recovered, in order, up to the number of extra-map photos
 * it kept. A spot with no kept photo is still included.
 *
 * @param {object} input
 * @param {string} input.city the `CityEnum` value
 * @param {string} input.map the main map's slug
 * @param {string} input.mid the main map's My Maps id
 * @param {PreparedSpot[]} input.spots after every extra map's {@link mergeExtraMatches}
 * @param {string[]} input.warnings
 * @param {Map<string, PhotoOutcome>} input.outcomes keyed by {@link photoKey}
 * @param {Map<string, string>} [input.hashes] `averageHash` by file name, for every written photo
 *   of a spot with photos from more than one map
 * @param {{ map: string, mid: string, placemarks: number, matched: number }[]} [input.extraMaps]
 * @param {{ conflicts: object[], ambiguous: object[], unmatched: object[] }} [input.matches] from
 *   {@link reportMatchEntries}, every extra map's concatenated
 * @returns {{ collection: object, report: object }}
 * @throws {Error} when a photo has no outcome, or a photo to compare has no hash
 */
export function buildCity({
  city,
  map,
  mid,
  spots,
  warnings,
  outcomes,
  hashes = new Map(),
  extraMaps = [],
  matches = { conflicts: [], ambiguous: [], unmatched: [] },
}) {
  const photosDead = [];
  const photosRecovered = [];
  const photosDuplicate = [];
  const photosNearDuplicate = [];
  const spotsWithoutPhotos = [];
  const statusCounts = { active: 0, demolished: 0, unclassified: 0 };
  const linkCounts = Object.fromEntries(
    [map, ...extraMaps.map((extra) => extra.map)].map((slug) => [slug, {}]),
  );
  let photosLinked = 0;
  let photosWritten = 0;
  const hashOf = (file, spotIdForError) => {
    if (!hashes.has(file)) {
      throw new Error(
        `no perceptual hash for ${file} of spot ${spotIdForError}`,
      );
    }
    return hashes.get(file);
  };

  const features = spots.map((spot) => {
    const kept = [];
    const dead = [];
    for (const photo of spot.photos) {
      photosLinked++;
      const counts = (linkCounts[photo.map] ??= {});
      counts[spot.id] = (counts[spot.id] ?? 0) + 1;
      const entry = { spotId: spot.id, map: photo.map, n: photo.n };
      const outcome = outcomes.get(photoKey(spot.id, photo.map, photo.n));
      if (outcome?.dead) {
        dead.push({ ...entry, reason: outcome.reason });
        continue;
      }
      if (!outcome?.written) {
        throw new Error(
          `no download outcome for photo ${photo.map}#${photo.n} of spot ${spot.id}`,
        );
      }
      const same = kept.find((keptPhoto) => keptPhoto.file === outcome.file);
      if (same) {
        photosDuplicate.push({
          ...entry,
          sameAs: { map: same.map, n: same.n },
        });
        continue;
      }
      const near =
        photo.map === map
          ? undefined
          : nearestKept(
              kept,
              photo.map,
              (file) => hashOf(file, spot.id),
              outcome.file,
            );
      if (near) {
        photosNearDuplicate.push({
          ...entry,
          sameAs: { map: near.photo.map, n: near.photo.n },
          distance: near.distance,
        });
        continue;
      }
      kept.push({ map: photo.map, n: photo.n, file: outcome.file });
    }

    const keptExtra = kept.filter((photo) => photo.map !== map);
    const recovered = dead
      .filter((entry) => entry.map === map)
      .slice(0, keptExtra.length);
    const from = [...new Set(keptExtra.map((photo) => photo.map))];
    photosRecovered.push(...recovered.map((entry) => ({ ...entry, from })));
    photosDead.push(...dead.filter((entry) => !recovered.includes(entry)));
    photosWritten += kept.length;
    if (kept.length === 0) {
      spotsWithoutPhotos.push(spot.id);
    }
    statusCounts[spot.status]++;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: spot.coordinates },
      properties: {
        id: spot.id,
        name: spot.name,
        status: spot.status,
        photos: kept.map(({ file }) => `spots/${city}/${file}`),
        sources: spot.sources,
      },
    };
  });

  return {
    collection: { type: 'FeatureCollection', features },
    report: {
      city,
      map,
      mid,
      placemarks: spots.length,
      spotsWritten: features.length,
      photosLinked,
      photosWritten,
      photosDead,
      photosRecovered,
      photosDuplicate,
      photosNearDuplicate,
      spotsWithoutPhotos,
      statusCounts,
      extraMaps,
      matches,
      linkCounts,
      warnings,
    },
  };
}

/**
 * The kept photo of another map that a photo is a near-duplicate of: the nearest within
 * {@link NEAR_DUPLICATE_MAX_DISTANCE}, the earliest on a tie.
 *
 * @param {{ map: string, n: number, file: string }[]} kept the spot's kept photos so far
 * @param {string} photoMap the map of the photo being checked
 * @param {(file: string) => string} hashOf
 * @param {string} file the photo's file
 * @returns {{ photo: { map: string, n: number, file: string }, distance: number } | undefined}
 */
function nearestKept(kept, photoMap, hashOf, file) {
  let nearest;
  for (const candidate of kept) {
    if (candidate.map === photoMap) {
      continue;
    }
    const distance = hashDistance(hashOf(file), hashOf(candidate.file));
    if (
      distance <= NEAR_DUPLICATE_MAX_DISTANCE &&
      (nearest === undefined || distance < nearest.distance)
    ) {
      nearest = { photo: candidate, distance };
    }
  }
  return nearest;
}

/**
 * Fails when any spot's properties carry a URL-shaped string, so no map's names, folders or notes
 * can leak a link into committed GeoJSON.
 *
 * @param {{ features: { properties: object }[] }} collection from {@link buildCity}
 * @returns {void}
 * @throws {Error} naming the spot and the field, e.g. `sources[1].description`
 */
export function assertNoUrls(collection) {
  for (const { properties } of collection.features) {
    for (const [field, value] of propertyFields(properties)) {
      const hit = URL_PATTERN.exec(JSON.stringify(value));
      if (hit) {
        throw new Error(
          `spot ${properties.id}: ${field} carries a URL ("${hit[0]}")`,
        );
      }
    }
  }
}

/**
 * A spot's properties as `[field, value]` pairs, each source record's fields listed one by one.
 *
 * @param {object} properties
 * @returns {[string, unknown][]}
 */
function propertyFields(properties) {
  return Object.entries(properties).flatMap(([key, value]) =>
    key === 'sources'
      ? value.flatMap((source, i) =>
          Object.entries(source).map(([sourceKey, sourceValue]) => [
            `sources[${i}].${sourceKey}`,
            sourceValue,
          ]),
        )
      : [[key, value]],
  );
}

/**
 * A placemark's status from its pin colour.
 *
 * @param {import('./kml.mjs').Placemark} placemark
 * @returns {'active' | 'demolished' | 'unclassified'}
 * @throws {Error} naming the placemark when its pin colour is unknown
 */
function statusOf(placemark) {
  try {
    return statusFor(placemark.styleUrl);
  } catch (error) {
    throw new Error(`placemark "${placemark.name}": ${error.message}`);
  }
}

/**
 * The source record of a placemark: its map, then its folder and notes when it has them.
 *
 * @param {string} map
 * @param {import('./kml.mjs').Placemark} placemark
 * @returns {{ map: string, folder?: string, description?: string }}
 */
function sourceOf(map, { folder, description }) {
  return {
    map,
    ...(folder !== undefined && { folder }),
    ...(description !== undefined && { description }),
  };
}

/**
 * Finds the dead photos that were written on the previous run, so the CLI can refuse to wipe them
 * when Google wrongly answers 403 or HTML for photos that are fine. A dead photo is newly dead when
 * its spot was in the previous GeoJSON, its position is within that spot's previous link count
 * (its written photos plus its dead and duplicate positions — a duplicate was written too), and
 * the previous report did not list it as dead already. A link that was already dead, or a position
 * the previous run did not have, is not newly dead. Only the main map's photos are checked.
 *
 * @param {object} input
 * @param {object} [input.previousCollection] the previous run's GeoJSON; absent on a first run
 * @param {object} [input.previousReport] the previous run's report; absent on a first run
 * @param {object} input.report the new report from {@link buildCity}
 * @returns {{ spotId: string, map: string, n: number, reason: string }[]} the newly dead entries of
 *   `report.photosDead`, in KML order; none when either previous output is absent
 */
export function findNewlyDeadPhotos({
  previousCollection,
  previousReport,
  report,
}) {
  if (!previousCollection || !previousReport) {
    return [];
  }
  const previousLinkCounts = new Map(
    previousCollection.features.map(({ properties }) => [
      properties.id,
      properties.photos.length,
    ]),
  );
  for (const { spotId } of [
    ...previousReport.photosDead,
    ...previousReport.photosDuplicate,
  ]) {
    if (previousLinkCounts.has(spotId)) {
      previousLinkCounts.set(spotId, previousLinkCounts.get(spotId) + 1);
    }
  }
  // A previous report written before photos were numbered per map lists `index` and no `map`.
  const previouslyDead = new Set(
    previousReport.photosDead.map((entry) =>
      photoKey(entry.spotId, entry.map ?? report.map, entry.n ?? entry.index),
    ),
  );
  return report.photosDead.filter(
    ({ spotId, map, n }) =>
      map === report.map &&
      n <= (previousLinkCounts.get(spotId) ?? 0) &&
      !previouslyDead.has(photoKey(spotId, map, n)),
  );
}

/**
 * Serialises a committed output: 2-space JSON with a trailing newline, like the pilot's GeoJSON.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function toJsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
