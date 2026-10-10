#!/usr/bin/env node
/**
 * Extracts every configured city's spots from its Google My Maps KML export into data/spots/.
 *
 *   npm run extract:spots [-- <city>…] [--reencode]
 *
 * Per city: fetch and parse the KML (cached in data/.cache/kml/ once it parses), map statuses and
 * ids, fingerprint every photo through its tiny rendition, download and encode only photos whose
 * WebP is not on disk yet, write the GeoJSON and report, and only then delete photo files the new
 * GeoJSON no longer references. A city that fails keeps its previous GeoJSON and report; the run
 * moves on and exits non-zero at the end, naming every failed city. Dead photo links are never
 * errors — they are listed in the report.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { writeFileAtomic } from './atomic.mjs';
import { buildCity, photoKey, prepareSpots, toJsonText } from './dataset.mjs';
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

async function extractCity(city, { mid, namePrefixes }, { reencode }) {
  const kmlText = await fetchKml(mid);
  const { spots, warnings } = prepareSpots(parseKml(kmlText), namePrefixes);
  // Cached only once it parses, so a consent page never replaces the last good copy.
  await mkdir(KML_CACHE_DIR, { recursive: true });
  await writeFileAtomic(join(KML_CACHE_DIR, `${city}.kml`), kmlText);

  const photoDir = join(SPOTS_DIR, city);
  await mkdir(photoDir, { recursive: true });
  const photos = spots.flatMap((spot) =>
    spot.photos.map((photo) => ({ spotId: spot.id, ...photo })),
  );
  // allSettled, not all: a failing photo must not leave others still writing into the next city.
  const settled = await Promise.allSettled(
    photos.map((photo) => resolvePhoto(photo, photoDir, reencode)),
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
  await writeFileAtomic(
    join(SPOTS_DIR, `${city}.geojson`),
    toJsonText(collection),
  );
  await writeFileAtomic(
    join(SPOTS_DIR, `${city}.report.json`),
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

async function fetchKml(mid) {
  const url = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(KML_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`KML export answered http ${response.status} (${url})`);
  }
  return response.text();
}

async function resolvePhoto({ spotId, url }, photoDir, reencode) {
  const rendition = await fetchPhoto(fingerprintUrl(url));
  if (rendition.dead) {
    return { dead: true, reason: rendition.reason };
  }
  const file = photoFileName(spotId, photoFingerprint(rendition.bytes));
  const outPath = join(photoDir, file);
  if (!reencode && existsSync(outPath)) {
    return { written: true, file };
  }
  const original = await fetchPhoto(url);
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

// Also sweeps `.tmp` leftovers of an interrupted run: nothing references them.
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
