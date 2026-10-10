#!/usr/bin/env node
/**
 * Extracts every configured city's spots from its Google My Maps KML export into data/spots/.
 *
 *   npm run extract:spots [-- <city>…] [--reencode]
 *
 * Per city: fetch and parse the KML (cached in data/.cache/kml/ once it parses), map statuses and
 * ids, fingerprint every photo through its tiny rendition, download and encode only photos whose
 * WebP is not on disk yet, write the GeoJSON and report, and only then delete photo files the new
 * GeoJSON no longer references. A city that fails keeps its previous GeoJSON, report and photos;
 * the run moves on and exits non-zero at the end, naming every failed city. Dead photo links are
 * not errors — they are listed in the report — except that a photo written on the previous run
 * that now comes back dead fails its city, so a wrong 403 from Google cannot wipe good photos.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { writeFileAtomic } from './atomic.mjs';
import {
  buildCity,
  findNewlyDeadPhotos,
  photoKey,
  prepareSpots,
  toJsonText,
} from './dataset.mjs';
import { photoFileName } from './ids.mjs';
import { parseKml } from './kml.mjs';
import {
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
const MAX_LISTED_NEWLY_DEAD = 5;

/**
 * Reads the command line. No city arguments means every known city.
 *
 * @param {string[]} argv the arguments after the script name
 * @param {string[]} knownCities the keys of `sources.json`, in registry order
 * @returns {{ cities: string[], reencode: boolean }}
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
  };
}

/** Runs the extraction for the cities on the command line and prints a per-city summary. */
async function main() {
  const sources = JSON.parse(await readFile(SOURCES_PATH, 'utf8'));
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2), Object.keys(sources));
  } catch (error) {
    console.error(`extract:spots: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const summary = [];
  const failures = [];
  for (const city of options.cities) {
    try {
      const { report, downloaded } = await extractCity(
        city,
        sources[city],
        options,
      );
      const duplicates = report.photosDuplicate.length;
      console.log(
        `${city}: ${report.spotsWritten} spots, ${report.photosWritten}/${report.photosLinked} photos (${downloaded} downloaded), ${report.photosDead.length} dead${duplicates > 0 ? `, ${duplicates} duplicate` : ''}`,
      );
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

  console.table(summary);
  if (failures.length > 0) {
    console.error(
      `extract:spots: ${failures.length} of ${options.cities.length} cities failed:`,
    );
    for (const { city, message } of failures) {
      console.error(`  ${city}: ${message}`);
    }
    process.exitCode = 1;
  }
}

/**
 * Extracts one city: fetches and parses its KML, resolves every photo, and writes the city's
 * GeoJSON and report.
 *
 * Ordering rules, so a city that fails at any step leaves its previous GeoJSON, report and photos
 * untouched: the KML is cached only once it parses (a consent page never replaces the last good
 * copy); nothing is written until every photo has resolved and the dead-photo guard has passed;
 * unreferenced photo files are deleted only after both the GeoJSON and the report are written.
 *
 * @param {string} city the `sources.json` key
 * @param {{ mid: string, namePrefixes: string[] }} source the city's `sources.json` entry
 * @param {{ reencode: boolean }} options `reencode` downloads and encodes every live photo again
 * @param {object} [deps] injected for tests; the defaults are the real run's
 * @param {typeof globalThis.fetch} [deps.fetch]
 * @param {string} [deps.spotsDir] holds the GeoJSON, the report and the `<city>/` photo folder
 * @param {string} [deps.kmlCacheDir] holds the last KML of each city that parsed
 * @returns {Promise<{ report: object, downloaded: number }>} `downloaded` counts the photos
 *   encoded in this run
 * @throws {Error} when the city fails at any step, saying why
 */
export async function extractCity(
  city,
  { mid, namePrefixes },
  { reencode },
  {
    fetch = globalThis.fetch,
    spotsDir = SPOTS_DIR,
    kmlCacheDir = KML_CACHE_DIR,
  } = {},
) {
  const kmlText = await fetchKml(mid, { fetch });
  const { spots, warnings } = prepareSpots(parseKml(kmlText), namePrefixes);
  await mkdir(kmlCacheDir, { recursive: true });
  await writeFileAtomic(join(kmlCacheDir, `${city}.kml`), kmlText);

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
      photoKey(photo.spotId, photo.index),
      settled[i].value,
    ]),
  );

  const { collection, report } = buildCity({
    city,
    mid,
    spots,
    warnings,
    outcomes,
  });
  const newlyDead = findNewlyDeadPhotos({
    ...(await readPreviousOutputs(spotsDir, city)),
    report,
  });
  if (newlyDead.length > 0) {
    throw newlyDeadError(newlyDead);
  }
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
  };
}

/**
 * Reads a city's GeoJSON and report from its previous run, for the dead-photo guard.
 *
 * @param {string} spotsDir
 * @param {string} city
 * @returns {Promise<{ previousCollection?: object, previousReport?: object }>} empty when either
 *   file is missing (a first run has nothing to compare)
 * @throws {Error} naming the file when one exists but cannot be read as the expected JSON, so a
 *   damaged file fails the city instead of silently switching the guard off
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
 * The error a city fails with when photos written last run now come back dead, listing the first
 * few by spot and position.
 *
 * @param {{ spotId: string, index: number, reason: string }[]} newlyDead from
 *   {@link findNewlyDeadPhotos}, not empty
 * @returns {Error}
 */
function newlyDeadError(newlyDead) {
  const listed = newlyDead
    .slice(0, MAX_LISTED_NEWLY_DEAD)
    .map(({ spotId, index, reason }) => `${spotId} #${index}: ${reason}`);
  const unlisted = newlyDead.length - listed.length;
  if (unlisted > 0) {
    listed.push(`and ${unlisted} more`);
  }
  const subject =
    newlyDead.length === 1
      ? '1 photo that was downloaded last run now comes back dead'
      : `${newlyDead.length} photos that were downloaded last run now come back dead`;
  const advice =
    newlyDead.length === 1
      ? 'remove the link in My Maps if the photo is really gone'
      : 'remove the links in My Maps if the photos are really gone';
  return new Error(
    `${subject} (${listed.join(', ')}); kept the previous files — re-run later, or ${advice}`,
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
