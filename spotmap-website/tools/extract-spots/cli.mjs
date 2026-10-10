#!/usr/bin/env node
/**
 * Extracts every configured city's spots from Google My Maps KML exports into data/spots/.
 *
 *   npm run extract:spots [-- <city>…] [--reencode]
 *
 * `data/spots/sources.json` is the registry: `maps` names each My Maps map by slug, `cities` gives
 * each city its main map, name prefixes and any extra maps. Each map is fetched and parsed once per
 * run, however many cities use it, and cached as data/.cache/kml/<map>.kml once it parses.
 *
 * Per city: take its main map's placemarks (only its own-prefixed ones on a shared map), map
 * statuses and ids, merge in the photos and source records of each extra map's matching
 * placemarks (match.mjs), fingerprint every photo through its tiny rendition, download and encode
 * only photos whose WebP is not on disk yet, write the GeoJSON and report, and only then delete
 * photo files the new GeoJSON no longer references. A city that fails keeps its previous GeoJSON
 * and report and deletes no photo (new or re-encoded WebPs may already be on disk; the next
 * successful run sweeps what it no longer references); the run moves on and exits non-zero at the
 * end, naming every failed city. Dead photo links are not errors — they are listed in the report —
 * except that a photo written on the previous run that now comes back dead, or a spot an extra map
 * fed last run that lost its match, fails its city, so a wrong 403 or a moved placemark cannot
 * wipe good photos.
 *
 * Only after a run naming no city in which every city succeeded, data/spots/<map>.map-report.json
 * is written for every map several cities share or one city uses as an extra map, listing the
 * placemarks no city or several cities claim.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { writeFileAtomic } from './atomic.mjs';
import {
  assertNoUrls,
  buildCity,
  findNewlyDeadPhotos,
  mergeExtraMatches,
  photoKey,
  prepareSpots,
  reportMatchEntries,
  toJsonText,
} from './dataset.mjs';
import { hasOwnPrefix, photoFileName } from './ids.mjs';
import { parseKml } from './kml.mjs';
import { buildMapReport, reportedMaps } from './map-report.mjs';
import { matchExtraPlacemarks } from './match.mjs';
import {
  averageHash,
  encodePhoto,
  fetchPhoto,
  fingerprintUrl,
  photoFingerprint,
} from './photos.mjs';

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SPOTS_DIR = join(APP_ROOT, 'data', 'spots');
const SOURCES_PATH = join(SPOTS_DIR, 'sources.json');
const KML_CACHE_DIR = join(APP_ROOT, 'data', '.cache', 'kml');
const KML_TIMEOUT_MS = 60_000;
/** How many entries of each kind the guard error lists before counting the rest. */
const MAX_LISTED_GUARD_ENTRIES = 5;

/**
 * Reads the command line. No city arguments means every known city.
 *
 * @param {string[]} argv the arguments after the script name
 * @param {string[]} knownCities the city keys of `sources.json`'s `cities`, in registry order
 * @returns {{ cities: string[], reencode: boolean, allCities: boolean }} `allCities` is true
 *   exactly when no city is named, the only run that may write map reports
 * @throws {Error} on an unknown city or flag
 */
export function parseCliArgs(argv, knownCities) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { reencode: { type: 'boolean', default: false } },
  });
  const unknown = positionals.filter((city) => !knownCities.includes(city));
  if (unknown.length > 0) {
    throw new Error(
      `unknown city: ${unknown.join(', ')} (known: ${knownCities.join(', ')})`,
    );
  }
  return {
    cities: positionals.length > 0 ? [...new Set(positionals)] : knownCities,
    reencode: values.reencode,
    allCities: positionals.length === 0,
  };
}

/** Reads the registry, runs the extraction, and sets the exit code. */
async function main() {
  const registry = JSON.parse(await readFile(SOURCES_PATH, 'utf8'));
  process.exitCode = await runExtraction(process.argv.slice(2), { registry });
}

/**
 * Runs the extraction for the cities on the command line, prints a per-city summary, and — after
 * a run naming no city in which every city succeeded — writes the map report of every shared or
 * extra map. A failed city does not stop the run.
 *
 * @param {string[]} argv the arguments after the script name
 * @param {object} deps
 * @param {{ maps: Record<string, string>, cities: Record<string, object> }} deps.registry
 *   `sources.json`
 * @param {typeof globalThis.fetch} [deps.fetch]
 * @param {string} [deps.spotsDir]
 * @param {string} [deps.kmlCacheDir]
 * @returns {Promise<0 | 1 | 2>} 0 when every city succeeded, 1 when any failed, 2 on bad arguments
 */
export async function runExtraction(
  argv,
  {
    registry: { maps, cities },
    fetch = globalThis.fetch,
    spotsDir = SPOTS_DIR,
    kmlCacheDir = KML_CACHE_DIR,
  },
) {
  let options;
  try {
    options = parseCliArgs(argv, Object.keys(cities));
  } catch (error) {
    console.error(`extract:spots: ${error.message}`);
    return 2;
  }

  const loadMap = createMapLoader({ maps, fetch, kmlCacheDir });
  const summary = [];
  const failures = [];
  const claimsByCity = {};
  for (const city of options.cities) {
    try {
      const { report, downloaded, claims } = await extractCity(
        city,
        cities[city],
        options,
        { maps, fetch, spotsDir, kmlCacheDir, loadMap },
      );
      claimsByCity[city] = claims;
      console.log(summaryLine(city, report, downloaded));
      summary.push({
        city,
        result: 'ok',
        spots: report.spotsWritten,
        photos: report.photosWritten,
        linked: report.photosLinked,
        dead: report.photosDead.length,
        downloaded,
      });
    } catch (error) {
      console.error(`${city}: FAILED — ${error.message}`);
      failures.push({ city, message: error.message });
      summary.push({ city, result: 'failed' });
    }
  }

  if (options.allCities && failures.length === 0) {
    await writeMapReports({ maps, cities, loadMap, claimsByCity, spotsDir });
  }
  console.table(summary);
  if (failures.length === 0) {
    return 0;
  }
  console.error(
    `extract:spots: ${failures.length} of ${options.cities.length} cities failed:`,
  );
  for (const { city, message } of failures) {
    console.error(`  ${city}: ${message}`);
  }
  return 1;
}

/**
 * One city's console line: spots, photos written of linked, downloads and dead links, plus any
 * recovered, duplicate and near-duplicate photos and unresolved placemarks.
 *
 * @param {string} city
 * @param {object} report from `buildCity`
 * @param {number} downloaded
 * @returns {string}
 */
function summaryLine(city, report, downloaded) {
  const { conflicts, ambiguous, unmatched } = report.matches;
  const extras = [
    [report.photosRecovered.length, 'recovered'],
    [report.photosDuplicate.length, 'duplicate'],
    [report.photosNearDuplicate.length, 'near-duplicate'],
    [conflicts.length + ambiguous.length + unmatched.length, 'match issues'],
  ]
    .filter(([count]) => count > 0)
    .map(([count, label]) => `, ${count} ${label}`)
    .join('');
  return `${city}: ${report.spotsWritten} spots, ${report.photosWritten}/${report.photosLinked} photos (${downloaded} downloaded), ${report.photosDead.length} dead${extras}`;
}

/**
 * Writes `<map>.map-report.json` for every shared or extra map and prints its warnings.
 *
 * @param {object} input
 * @param {Record<string, string>} input.maps
 * @param {Record<string, object>} input.cities
 * @param {(slug: string) => Promise<import('./kml.mjs').Placemark[]>} input.loadMap
 * @param {Record<string, Record<string, number[]>>} input.claimsByCity from each city's
 *   {@link extractCity}, in registry order
 * @param {string} input.spotsDir
 * @returns {Promise<void>}
 */
async function writeMapReports({
  maps,
  cities,
  loadMap,
  claimsByCity,
  spotsDir,
}) {
  for (const map of reportedMaps(maps, cities)) {
    const claims = Object.fromEntries(
      Object.entries(claimsByCity)
        .filter(([, byMap]) => byMap[map] !== undefined)
        .map(([city, byMap]) => [city, byMap[map]]),
    );
    const { report, warnings } = buildMapReport({
      map,
      mid: maps[map],
      placemarks: await loadMap(map),
      claimsByCity: claims,
    });
    for (const warning of warnings) {
      console.warn(`extract:spots: ${warning}`);
    }
    await writeFileAtomic(
      join(spotsDir, `${map}.map-report.json`),
      toJsonText(report),
    );
  }
}

/**
 * Creates a run's map loader: each map is fetched and parsed at most once, however many cities
 * use it, and cached once it parses (a consent page never replaces the last good copy). A map that
 * fails fails every city that loads it, naming the map.
 *
 * @param {object} input
 * @param {Record<string, string>} input.maps slug → My Maps id
 * @param {typeof globalThis.fetch} input.fetch
 * @param {string} input.kmlCacheDir
 * @returns {(slug: string) => Promise<import('./kml.mjs').Placemark[]>}
 */
export function createMapLoader({ maps, fetch, kmlCacheDir }) {
  const loaded = new Map();
  return function loadMap(slug) {
    if (!loaded.has(slug)) {
      loaded.set(slug, load(slug));
    }
    return loaded.get(slug);
  };

  /**
   * Fetches, parses and caches one map.
   *
   * @param {string} slug
   * @returns {Promise<import('./kml.mjs').Placemark[]>}
   * @throws {Error} naming the map when it is unknown, cannot be fetched or does not parse
   */
  async function load(slug) {
    if (!Object.hasOwn(maps, slug)) {
      throw new Error(`map ${slug} is not in sources.json`);
    }
    try {
      const kmlText = await fetchKml(maps[slug], { fetch });
      const placemarks = parseKml(kmlText);
      await mkdir(kmlCacheDir, { recursive: true });
      await writeFileAtomic(join(kmlCacheDir, `${slug}.kml`), kmlText);
      return placemarks;
    } catch (error) {
      throw new Error(`map ${slug}: ${error.message}`);
    }
  }
}

/**
 * Extracts one city: loads its main map's placemarks (only its own-prefixed ones when
 * `onlyPrefixed`), merges in each extra map's matching placemarks, resolves every photo, and
 * writes the city's GeoJSON and report.
 *
 * Ordering rules, so a city that fails at any step keeps its previous GeoJSON and report and loses
 * no photo: a map's KML is cached only once it parses (a consent page never replaces the last good
 * copy); extra maps are matched before any photo is fetched; photos are encoded as they resolve,
 * so new or `--reencode`d WebPs may already be on disk when a later step fails, but the GeoJSON and
 * report are written only once every photo has resolved, the dead-photo guard has passed and the
 * output carries no URL; unreferenced photo files are deleted only after both the GeoJSON and the
 * report are written.
 *
 * @param {string} city the `sources.json` key
 * @param {object} source the city's `sources.json` entry
 * @param {string} source.map the main map's slug
 * @param {string[]} source.namePrefixes the city's own name prefixes
 * @param {string[]} [source.extraMaps] the slugs of the maps that only add photos and source
 *   records, matched in this order
 * @param {boolean} [source.onlyPrefixed] keep only the main map's own-prefixed placemarks (a map
 *   several cities share)
 * @param {{ reencode: boolean }} options `reencode` downloads and encodes every live photo again
 * @param {object} deps the registry's maps, the rest injected for tests (the defaults are the real
 *   run's)
 * @param {Record<string, string>} deps.maps `sources.json`'s `maps` (slug → My Maps id)
 * @param {typeof globalThis.fetch} [deps.fetch]
 * @param {string} [deps.spotsDir] holds the GeoJSON, the report and the `<city>/` photo folder
 * @param {string} [deps.kmlCacheDir] holds the last KML of each map that parsed
 * @param {(slug: string) => Promise<import('./kml.mjs').Placemark[]>} [deps.loadMap] the run's
 *   {@link createMapLoader}, shared across cities so each map is fetched once
 * @returns {Promise<{ report: object, downloaded: number, claims: Record<string, number[]> }>}
 *   `downloaded` counts the photos encoded in this run; `claims` lists, per map slug the city used,
 *   the placemark ordinals it claims (its spots, and its matched, conflicting and ambiguous
 *   placemarks), ascending
 * @throws {Error} when the city fails at any step, saying why
 */
export async function extractCity(
  city,
  { map, namePrefixes, extraMaps = [], onlyPrefixed = false },
  { reencode },
  {
    maps,
    fetch = globalThis.fetch,
    spotsDir = SPOTS_DIR,
    kmlCacheDir = KML_CACHE_DIR,
    loadMap = createMapLoader({ maps, fetch, kmlCacheDir }),
  },
) {
  const mainPlacemarks = await loadMap(map);
  const prepared = prepareSpots(
    onlyPrefixed
      ? mainPlacemarks.filter(({ name }) => hasOwnPrefix(name, namePrefixes))
      : mainPlacemarks,
    namePrefixes,
    map,
  );
  let { spots } = prepared;
  const warnings = [...prepared.warnings];
  const claims = { [map]: spots.map(({ ordinal }) => ordinal) };
  const extraMapsReport = [];
  const matches = { conflicts: [], ambiguous: [], unmatched: [] };
  for (const extra of extraMaps) {
    const placemarks = await loadMap(extra);
    const result = matchExtraPlacemarks(spots, placemarks, namePrefixes);
    spots = mergeExtraMatches(spots, extra, result.matches);
    warnings.push(...result.warnings.map((warning) => `${extra}: ${warning}`));
    const entries = reportMatchEntries(extra, spots, result);
    for (const kind of Object.keys(matches)) {
      matches[kind].push(...entries[kind]);
    }
    extraMapsReport.push({
      map: extra,
      mid: maps[extra],
      placemarks: placemarks.length,
      matched: result.matches.length,
    });
    claims[extra] = [
      ...new Set(
        [...result.matches, ...result.conflicts, ...result.ambiguous].map(
          ({ placemark }) => placemark.ordinal,
        ),
      ),
    ].sort((a, b) => a - b);
  }

  const photoDir = join(spotsDir, city);
  await mkdir(photoDir, { recursive: true });
  const photos = spots.flatMap((spot) =>
    spot.photos.map((photo) => ({ spotId: spot.id, ...photo })),
  );
  // allSettled, not all: a failing photo must not leave others still writing into the next city.
  const settled = await Promise.allSettled(
    photos.map((photo) => resolvePhoto(photo, { photoDir, reencode, fetch })),
  );
  const failed = settled.find((result) => result.status === 'rejected');
  if (failed) {
    throw failed.reason;
  }
  const outcomes = new Map(
    photos.map((photo, i) => [
      photoKey(photo.spotId, photo.map, photo.n),
      settled[i].value,
    ]),
  );

  const { collection, report } = buildCity({
    city,
    map,
    mid: maps[map],
    spots,
    warnings,
    outcomes,
    hashes: await hashMixedSpots(spots, outcomes, photoDir),
    extraMaps: extraMapsReport,
    matches,
  });
  const { newlyDead, lostMatches } = findNewlyDeadPhotos({
    ...(await readPreviousOutputs(spotsDir, city)),
    collection,
    report,
  });
  if (newlyDead.length > 0 || lostMatches.length > 0) {
    throw guardError(newlyDead, lostMatches);
  }
  assertNoUrls(collection);
  await writeFileAtomic(
    join(spotsDir, `${city}.geojson`),
    toJsonText(collection),
  );
  await writeFileAtomic(
    join(spotsDir, `${city}.report.json`),
    toJsonText(report),
  );
  const written = [...outcomes.values()].filter((outcome) => outcome.written);
  await removeUnreferencedFiles(
    photoDir,
    new Set(written.map((outcome) => outcome.file)),
  );

  return {
    report,
    downloaded: written.filter((outcome) => outcome.downloaded).length,
    claims,
  };
}

/**
 * Hashes every written photo of each spot whose photos come from more than one map — the only
 * photos `buildCity` compares for near-duplicates. Reads the encoded files, so nothing is
 * downloaded again.
 *
 * @param {import('./dataset.mjs').PreparedSpot[]} spots
 * @param {Map<string, import('./dataset.mjs').PhotoOutcome>} outcomes keyed by `photoKey`
 * @param {string} photoDir the city's photo folder
 * @returns {Promise<Map<string, string>>} `averageHash` by file name
 */
async function hashMixedSpots(spots, outcomes, photoDir) {
  const files = new Set();
  for (const spot of spots) {
    if (new Set(spot.photos.map(({ map }) => map)).size < 2) {
      continue;
    }
    for (const photo of spot.photos) {
      const outcome = outcomes.get(photoKey(spot.id, photo.map, photo.n));
      if (outcome.written) {
        files.add(outcome.file);
      }
    }
  }
  const hashes = new Map();
  for (const file of files) {
    hashes.set(file, await averageHash(join(photoDir, file)));
  }
  return hashes;
}

/**
 * Reads a city's GeoJSON and report from its previous run, for the dead-photo guard.
 *
 * @param {string} spotsDir
 * @param {string} city
 * @returns {Promise<{ previousCollection?: object, previousReport?: object }>} empty when either
 *   file is missing (a first run has nothing to compare)
 * @throws {Error} naming the file when one exists but cannot be read as the expected JSON — a
 *   GeoJSON without a features list, or a report without photosDead or photosDuplicate lists, or
 *   with a photosRecovered or photosNearDuplicate that is not a list or a linkCounts that is not
 *   an object — so a damaged file fails the city instead of silently weakening the guard
 */
async function readPreviousOutputs(spotsDir, city) {
  const geojsonPath = join(spotsDir, `${city}.geojson`);
  const reportPath = join(spotsDir, `${city}.report.json`);
  if (!existsSync(geojsonPath) || !existsSync(reportPath)) {
    return {};
  }
  const previousCollection = await readJson(geojsonPath);
  const previousReport = await readJson(reportPath);
  if (!Array.isArray(previousCollection?.features)) {
    throw new Error(`previous ${geojsonPath} has no features list`);
  }
  if (
    !Array.isArray(previousReport?.photosDead) ||
    !Array.isArray(previousReport?.photosDuplicate)
  ) {
    throw new Error(
      `previous ${reportPath} has no photosDead or photosDuplicate list`,
    );
  }
  for (const field of ['photosRecovered', 'photosNearDuplicate']) {
    if (
      previousReport[field] !== undefined &&
      !Array.isArray(previousReport[field])
    ) {
      throw new Error(
        `previous ${reportPath} has a ${field} that is not a list`,
      );
    }
  }
  const { linkCounts } = previousReport;
  if (
    linkCounts !== undefined &&
    (linkCounts === null ||
      typeof linkCounts !== 'object' ||
      Array.isArray(linkCounts))
  ) {
    throw new Error(
      `previous ${reportPath} has a linkCounts that is not an object`,
    );
  }
  return { previousCollection, previousReport };
}

/**
 * Reads and parses a JSON file.
 *
 * @param {string} path
 * @returns {Promise<unknown>}
 * @throws {Error} naming the file when it cannot be read or parsed
 */
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read previous ${path}: ${error.message}`);
  }
}

/**
 * The error a city fails with when the guard fires: photos written last run that now come back
 * dead, and spots an extra map fed last run that lost their match, the first few of each listed.
 *
 * @param {{ spotId: string, map: string, n: number, reason: string }[]} newlyDead from
 *   {@link findNewlyDeadPhotos}
 * @param {{ map: string, spotId: string, ordinal: number, name: string }[]} lostMatches from
 *   {@link findNewlyDeadPhotos}; at least one of the two is not empty
 * @returns {Error}
 */
function guardError(newlyDead, lostMatches) {
  const problems = [];
  if (newlyDead.length > 0) {
    const subject =
      newlyDead.length === 1
        ? '1 photo that was downloaded last run now comes back dead'
        : `${newlyDead.length} photos that were downloaded last run now come back dead`;
    problems.push(
      `${subject} (${listFirst(newlyDead.map(({ spotId, map, n, reason }) => `${spotId} ${map}#${n}: ${reason}`))})`,
    );
  }
  if (lostMatches.length > 0) {
    const subject =
      lostMatches.length === 1
        ? '1 spot an extra map fed last run lost its match'
        : `${lostMatches.length} spots an extra map fed last run lost their match`;
    problems.push(
      `${subject} (${listFirst(lostMatches.map(({ spotId, map, ordinal, name }) => `${spotId} ← ${map} placemark #${ordinal} "${name}"`))})`,
    );
  }
  const advice =
    lostMatches.length > 0
      ? 'fix the placemarks or links in My Maps if the change is real'
      : newlyDead.length === 1
        ? 'remove the link in My Maps if the photo is really gone'
        : 'remove the links in My Maps if the photos are really gone';
  return new Error(
    `${problems.join('; ')}; kept the previous files — re-run later, or ${advice}`,
  );
}

/**
 * Joins the first {@link MAX_LISTED_GUARD_ENTRIES} items, then says how many more there are.
 *
 * @param {string[]} items
 * @returns {string}
 */
function listFirst(items) {
  const listed = items.slice(0, MAX_LISTED_GUARD_ENTRIES);
  const unlisted = items.length - listed.length;
  return [...listed, ...(unlisted > 0 ? [`and ${unlisted} more`] : [])].join(
    ', ',
  );
}

/**
 * Downloads a map's KML export.
 *
 * @param {string} mid the My Maps map id
 * @param {object} options
 * @param {typeof globalThis.fetch} options.fetch
 * @returns {Promise<string>} the response text, not yet validated as KML
 * @throws {Error} on a non-2xx answer, naming the status and the URL
 */
async function fetchKml(mid, { fetch }) {
  const url = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(KML_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`KML export answered http ${response.status} (${url})`);
  }
  return response.text();
}

/**
 * Resolves one photo link to its outcome. The tiny rendition is always fetched: it is both the
 * dead-link check and the fingerprint that names the file. The original is fetched and encoded
 * only when that file is not on disk yet, or on `reencode`.
 *
 * @param {{ spotId: string, url: string }} photo
 * @param {object} options
 * @param {string} options.photoDir the city's photo folder
 * @param {boolean} options.reencode encode again even when the file exists
 * @param {typeof globalThis.fetch} options.fetch
 * @returns {Promise<import('./dataset.mjs').PhotoOutcome>}
 * @throws {Error} when retries run out or the original cannot be encoded
 */
async function resolvePhoto({ spotId, url }, { photoDir, reencode, fetch }) {
  const rendition = await fetchPhoto(fingerprintUrl(url), { fetch });
  if (rendition.dead) {
    return { dead: true, reason: rendition.reason };
  }
  const file = photoFileName(spotId, photoFingerprint(rendition.bytes));
  const outPath = join(photoDir, file);
  if (!reencode && existsSync(outPath)) {
    return { written: true, file };
  }
  const original = await fetchPhoto(url, { fetch });
  if (original.dead) {
    return { dead: true, reason: original.reason };
  }
  try {
    await encodePhoto(original.bytes, outPath);
  } catch (error) {
    throw new Error(`cannot encode ${url}: ${error.message}`);
  }
  return { written: true, file, downloaded: true };
}

/**
 * Deletes every file in `dir` whose name is not in `referenced`. That also sweeps the `.tmp`
 * leftovers of an interrupted run: nothing references them.
 *
 * @param {string} dir a city's photo folder
 * @param {Set<string>} referenced the file names the new GeoJSON lists
 * @returns {Promise<void>}
 */
async function removeUnreferencedFiles(dir, referenced) {
  for (const name of await readdir(dir)) {
    if (!referenced.has(name)) {
      await rm(join(dir, name), { force: true });
    }
  }
}

if (import.meta.main) {
  await main();
}
