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
 * Finds what the CLI must refuse to overwrite, so a wrong 403 or a moved placemark cannot wipe
 * good photos:
 *
 * - **newly dead** — a `photosDead` or `photosRecovered` entry, numbered within the previous run's
 *   link count of its spot on its map, that is not one of the previous report's entries in either
 *   list. Removed or added links may have renumbered the spot's photos on that map, so the photos
 *   written in both runs (same file) pin how far: between two of them, or past the first or last,
 *   a photo moved by as much as either bound did, assuming links there were only removed or only
 *   added. An entry counts as a previous one that sits in the same gap at a number that far off,
 *   each previous entry standing for one entry only (see {@link unmatchedLostEntries} for which
 *   entry is named when several could be). Known limits: a removed already-dead link can still
 *   cancel out a newly dead photo in the same gap, and a link removed and another added in one
 *   gap can make a still-dead photo there look newly dead. A spot whose GeoJSON and report do
 *   not add up for either run is checked as one gap, renumbered down by at most its drop in link
 *   count;
 * - **lost match** — every spot an extra map fed photos to last run that an ambiguous placemark or
 *   an unmerged conflict of that map names, and, while that map has an unmatched placemark this
 *   run (one that may be the feeding placemark renamed and moved), every spot it fed last run that
 *   no placemark of it matches now. With nothing unmatched, a spot that lost its match had its
 *   placemark deleted, which is a legitimate removal.
 *
 * A spot whose new GeoJSON still lists every photo file it listed before lost nothing and is
 * excused from both, as is a spot that left the main map. A previous report without `linkCounts`
 * predates extra maps: only main-map entries are checked, its link count is the spot's written
 * photos plus its dead and duplicate entries, and its entries without `map` are main-map ones
 * numbered by `index`.
 *
 * @param {object} input
 * @param {object} [input.previousCollection] the previous run's GeoJSON; absent on a first run
 * @param {object} [input.previousReport] the previous run's report; absent on a first run
 * @param {object} input.collection the new GeoJSON from {@link buildCity}
 * @param {object} input.report the new report from {@link buildCity}
 * @returns {{ newlyDead: { spotId: string, map: string, n: number, reason: string }[], lostMatches: { map: string, spotId: string, ordinal?: number, name: string }[] }}
 *   both empty when either previous output is absent; `newlyDead` lists the `photosDead` entries
 *   first, then the `photosRecovered` ones (without `from`), each in report order; `lostMatches`
 *   lists the ambiguous and unmerged-conflict placemarks first (with their `ordinal` and `name`),
 *   then each other spot that lost its match, once per map, named by its previous source record
 *   of that map (no `ordinal`: which unmatched placemark it was cannot be told)
 */
export function findNewlyDeadPhotos({
  previousCollection,
  previousReport,
  collection,
  report,
}) {
  if (!previousCollection || !previousReport) {
    return { newlyDead: [], lostMatches: [] };
  }
  const mainMap = report.map;
  const linkCounts =
    previousReport.linkCounts ??
    legacyLinkCounts(previousCollection, previousReport, mainMap);
  const previousCount = (map, spotId) => linkCounts[map]?.[spotId] ?? 0;
  const excused = excusedSpots(previousCollection, collection);
  const previousWritten = writtenPhotos(
    previousCollection,
    previousReport,
    linkCounts,
    mainMap,
  );
  const currentWritten = writtenPhotos(
    collection,
    report,
    report.linkCounts ?? {},
    mainMap,
  );
  const gapsOf = (map, spotId) => {
    const before = previousCount(map, spotId);
    const now = report.linkCounts?.[map]?.[spotId] ?? 0;
    const writtenBefore = previousWritten.get(spotId);
    const writtenNow = currentWritten.get(spotId);
    if (writtenBefore === undefined || writtenNow === undefined) {
      return [
        {
          previous: [0, Infinity],
          current: [0, Infinity],
          shifts: [0, Math.max(0, before - now)],
        },
      ];
    }
    return gapsBetween(
      commonPhotos(writtenBefore.get(map) ?? [], writtenNow.get(map) ?? []),
      before,
      now,
    );
  };
  const newlyDead = unmatchedLostEntries(
    [...report.photosDead, ...report.photosRecovered].filter(
      ({ spotId, map, n }) =>
        !excused.has(spotId) && n <= previousCount(map, spotId),
    ),
    [
      ...previousReport.photosDead,
      ...(previousReport.photosRecovered ?? []),
    ].map((entry) => ({
      spotId: entry.spotId,
      map: entry.map ?? mainMap,
      n: entry.n ?? entry.index,
    })),
    previousCount,
    gapsOf,
  ).map(({ spotId, map, n, reason }) => ({ spotId, map, n, reason }));

  const wasFed = ({ map, spotId }) =>
    !excused.has(spotId) && previousCount(map, spotId) > 0;
  const lostPlacemarks = [
    ...report.matches.ambiguous.flatMap(({ map, ordinal, name, candidates }) =>
      candidates.map((spotId) => ({ map, spotId, ordinal, name })),
    ),
    ...report.matches.conflicts
      .filter(({ merged }) => !merged)
      .map(({ map, spotId, ordinal, name }) => ({
        map,
        spotId,
        ordinal,
        name,
      })),
  ].filter(wasFed);
  const listed = new Set(
    lostPlacemarks.map(({ map, spotId }) => `${spotId}#${map}`),
  );
  const previousById = new Map(
    previousCollection.features.map(({ properties }) => [
      properties.id,
      properties,
    ]),
  );
  const unmatchedMaps = new Set(report.matches.unmatched.map(({ map }) => map));
  const extraMaps = Object.keys(linkCounts).filter(
    (map) => map !== mainMap && unmatchedMaps.has(map),
  );
  const unmatchedSpots = collection.features.flatMap(({ properties }) => {
    const previous = previousById.get(properties.id);
    const matchedMaps = new Set(properties.sources.map(({ map }) => map));
    return extraMaps
      .filter(
        (map) =>
          previous !== undefined &&
          !matchedMaps.has(map) &&
          !listed.has(`${properties.id}#${map}`) &&
          wasFed({ map, spotId: properties.id }),
      )
      .map((map) => ({
        map,
        spotId: properties.id,
        name:
          previous.sources.find((source) => source.map === map)?.name ??
          previous.name,
      }));
  });
  return { newlyDead, lostMatches: [...lostPlacemarks, ...unmatchedSpots] };
}

/**
 * The stretch of a spot's photos on one map between two photos written in both runs (or the
 * list's start or end), with the photo numbers it spans in each run, both bounds exclusive.
 *
 * @typedef {object} PhotoGap
 * @property {[number, number]} previous the previous run's bounding numbers
 * @property {[number, number]} current this run's bounding numbers
 * @property {[number, number]} shifts the lowest and highest a photo inside may have moved down,
 *   previous number minus current
 */

/**
 * The lost entries of this run that no previous lost entry accounts for. Within each gap, every
 * entry is placed on a previous photo number its gap's shifts allow, each number taking one entry
 * and in order: an entry placed on a previous lost entry is accounted for; one placed on a photo
 * written last run, or on none, is not. The placement leaves the fewest unaccounted and, among
 * those, prefers entries on previous photos to new dead links, then photos that kept their
 * numbers, so that when nothing tells which photo died the likeliest one is named.
 *
 * @template {{ spotId: string, map: string, n: number }} Entry
 * @param {Entry[]} entries this run's lost entries to check, in report order
 * @param {{ spotId: string, map: string, n: number }[]} previousEntries the previous run's
 * @param {(map: string, spotId: string) => number} previousCount the spot's link count on that map
 *   last run
 * @param {(map: string, spotId: string) => PhotoGap[]} gapsOf the spot's gaps on that map
 * @returns {Entry[]} the unaccounted entries, in report order
 */
function unmatchedLostEntries(entries, previousEntries, previousCount, gapsOf) {
  const groupKey = ({ spotId, map }) => `${spotId}#${map}`;
  const previousNumbers = Map.groupBy(previousEntries, groupKey);
  const unaccounted = new Set();
  for (const [key, group] of Map.groupBy(entries, groupKey)) {
    const { map, spotId } = group[0];
    const lost = new Set((previousNumbers.get(key) ?? []).map(({ n }) => n));
    const count = previousCount(map, spotId);
    for (const gap of gapsOf(map, spotId)) {
      const inside = (n, [from, to]) => from < n && n < to;
      const numbers = new Set(
        [...Array.from({ length: count }, (_, i) => i + 1), ...lost].filter(
          (n) => inside(n, gap.previous),
        ),
      );
      const positions = [...numbers]
        .sort((a, b) => a - b)
        .map((n) => ({ n, lost: lost.has(n) }));
      const gapEntries = group
        .filter(({ n }) => inside(n, gap.current))
        .sort((a, b) => a.n - b.n);
      for (const entry of unplacedEntries(gapEntries, positions, gap.shifts)) {
        unaccounted.add(entry);
      }
    }
  }
  return entries.filter((entry) => unaccounted.has(entry));
}

/**
 * The entries of one gap that cannot be placed on a previous lost entry: of all in-order
 * placements within the shifts, the one leaving the fewest such entries, then placing the fewest
 * on no previous photo (a new dead link), then moving photos the least in total.
 *
 * @template {{ n: number }} Entry
 * @param {Entry[]} entries this run's lost entries in the gap, by number
 * @param {{ n: number, lost: boolean }[]} positions the previous run's photo numbers in the gap,
 *   by number, each marked when it was a lost entry
 * @param {[number, number]} shifts the gap's lowest and highest shift
 * @returns {Entry[]}
 */
function unplacedEntries(entries, positions, [lowest, highest]) {
  // best[i][j]: the best placement of the first i entries on the first j positions.
  const best = Array.from({ length: entries.length + 1 }, () =>
    Array.from({ length: positions.length + 1 }),
  );
  const offer = (i, j, candidate) => {
    const current = best[i][j];
    if (
      current === undefined ||
      candidate.unplaced.length < current.unplaced.length ||
      (candidate.unplaced.length === current.unplaced.length &&
        (candidate.added < current.added ||
          (candidate.added === current.added &&
            candidate.moved < current.moved)))
    ) {
      best[i][j] = candidate;
    }
  };
  for (let i = 0; i <= entries.length; i++) {
    for (let j = 0; j <= positions.length; j++) {
      if (i === 0 && j === 0) {
        best[0][0] = { unplaced: [], added: 0, moved: 0 };
        continue;
      }
      if (j > 0) {
        offer(i, j, best[i][j - 1]);
      }
      if (i === 0) {
        continue;
      }
      const entry = entries[i - 1];
      const before = best[i - 1][j];
      offer(i, j, {
        ...before,
        unplaced: [...before.unplaced, entry],
        added: before.added + 1,
      });
      if (j > 0) {
        const position = positions[j - 1];
        const shift = position.n - entry.n;
        if (lowest <= shift && shift <= highest) {
          const placed = best[i - 1][j - 1];
          offer(i, j, {
            unplaced: position.lost
              ? placed.unplaced
              : [...placed.unplaced, entry],
            added: placed.added,
            moved: placed.moved + Math.abs(shift),
          });
        }
      }
    }
  }
  return best[entries.length][positions.length].unplaced;
}

/**
 * A spot's gaps on one map, between the photos written in both runs. A gap's shifts span those
 * of its two bounds, which assumes links were only removed, or only added, inside it.
 *
 * @param {{ previous: number, current: number }[]} common the photos written in both runs, in
 *   order, by their numbers in each
 * @param {number} previousCount the spot's link count on that map last run
 * @param {number} currentCount the spot's link count on that map this run
 * @returns {PhotoGap[]}
 */
function gapsBetween(common, previousCount, currentCount) {
  const bounds = [
    { previous: 0, current: 0 },
    ...common,
    { previous: previousCount + 1, current: currentCount + 1 },
  ];
  return bounds.slice(1).map((end, i) => {
    const start = bounds[i];
    const shifts = [
      start.previous - start.current,
      end.previous - end.current,
    ].sort((a, b) => a - b);
    return {
      previous: [start.previous, end.previous],
      current: [start.current, end.current],
      shifts,
    };
  });
}

/**
 * The photos written in both runs, by file: the longest in-order run of shared files, so a
 * reordered photo bounds no gap.
 *
 * @param {{ n: number, file: string }[]} before the previous run's written photos of a spot on
 *   one map, by number
 * @param {{ n: number, file: string }[]} now this run's, likewise
 * @returns {{ previous: number, current: number }[]} in order
 */
function commonPhotos(before, now) {
  // longest[i][j]: the longest common run of before[i…] and now[j…].
  const longest = Array.from({ length: before.length + 1 }, () =>
    new Array(now.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = now.length - 1; j >= 0; j--) {
      longest[i][j] =
        before[i].file === now[j].file
          ? longest[i + 1][j + 1] + 1
          : Math.max(longest[i + 1][j], longest[i][j + 1]);
    }
  }
  const common = [];
  for (let i = 0, j = 0; i < before.length && j < now.length;) {
    if (before[i].file === now[j].file) {
      common.push({ previous: before[i].n, current: now[j].n });
      i++;
      j++;
    } else if (longest[i + 1][j] >= longest[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return common;
}

/**
 * Each spot's written photos per map, with their numbers: a run's GeoJSON lists them in source
 * order, main map first, then each extra map in `linkCounts` order, and every number its report
 * lists as dead, recovered, duplicate or near-duplicate was not written. A spot whose GeoJSON and
 * report do not add up is left out, so the guard falls back to link counts alone for it.
 *
 * @param {object} collection the run's GeoJSON
 * @param {object} report the run's report; entries without `map` are main-map ones numbered by
 *   `index`
 * @param {Record<string, Record<string, number>>} counts the run's link counts by map, then spot
 * @param {string} mainMap the main map's slug
 * @returns {Map<string, Map<string, { n: number, file: string }[]>>} by spot id, then map
 */
function writtenPhotos(collection, report, counts, mainMap) {
  const notWritten = Map.groupBy(
    [
      ...(report.photosDead ?? []),
      ...(report.photosRecovered ?? []),
      ...(report.photosDuplicate ?? []),
      ...(report.photosNearDuplicate ?? []),
    ],
    (entry) => `${entry.spotId}#${entry.map ?? mainMap}`,
  );
  const maps = [
    mainMap,
    ...Object.keys(counts).filter((map) => map !== mainMap),
  ];
  const written = new Map();
  for (const { properties } of collection.features) {
    const files = [...properties.photos];
    const byMap = new Map();
    let addsUp = true;
    for (const map of maps) {
      const count = counts[map]?.[properties.id] ?? 0;
      const listed = (notWritten.get(`${properties.id}#${map}`) ?? []).map(
        (entry) => entry.n ?? entry.index,
      );
      const skipped = new Set(listed);
      if (
        !Number.isInteger(count) ||
        skipped.size !== listed.length ||
        listed.some((n) => !Number.isInteger(n) || n < 1 || n > count) ||
        count - skipped.size > files.length
      ) {
        addsUp = false;
        break;
      }
      const photos = [];
      for (let n = 1; n <= count; n++) {
        if (!skipped.has(n)) {
          photos.push({ n, file: files.shift() });
        }
      }
      byMap.set(map, photos);
    }
    if (addsUp && files.length === 0) {
      written.set(properties.id, byMap);
    }
  }
  return written;
}

/**
 * The link counts a pre-`linkCounts` report implies: per spot, its written photos plus its dead
 * and duplicate entries (a duplicate was written too), all on the main map.
 *
 * @param {object} previousCollection the previous run's GeoJSON
 * @param {object} previousReport the previous run's report, without `linkCounts`
 * @param {string} mainMap the main map's slug
 * @returns {Record<string, Record<string, number>>} by map, then spot id; only `mainMap`
 */
function legacyLinkCounts(previousCollection, previousReport, mainMap) {
  const counts = Object.fromEntries(
    previousCollection.features.map(({ properties }) => [
      properties.id,
      properties.photos.length,
    ]),
  );
  for (const { spotId } of [
    ...previousReport.photosDead,
    ...previousReport.photosDuplicate,
  ]) {
    if (Object.hasOwn(counts, spotId)) {
      counts[spotId]++;
    }
  }
  return { [mainMap]: counts };
}

/**
 * The spots that lost no photo: their new GeoJSON lists every photo file their previous one did.
 *
 * @param {object} previousCollection the previous run's GeoJSON
 * @param {object} collection the new GeoJSON
 * @returns {Set<string>} spot ids
 */
function excusedSpots(previousCollection, collection) {
  const photosNow = new Map(
    collection.features.map(({ properties }) => [
      properties.id,
      new Set(properties.photos),
    ]),
  );
  return new Set(
    previousCollection.features
      .filter(({ properties }) => {
        const now = photosNow.get(properties.id);
        return (
          now !== undefined &&
          properties.photos.every((photo) => now.has(photo))
        );
      })
      .map(({ properties }) => properties.id),
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
