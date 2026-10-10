/**
 * Tests for the extraction CLI: argument handling, and one city's extraction against a fake web in
 * a temporary folder. An unknown city must fail before any network call, so a typo never costs a
 * 16-city run; a city that fails at any step must leave its previous GeoJSON, report and photos
 * untouched.
 */
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { extractCity, parseCliArgs } from './cli.mjs';
import { toJsonText } from './dataset.mjs';
import { photoFileName, spotId } from './ids.mjs';
import { photoFingerprint } from './photos.mjs';

const CITIES = ['vienna', 'graz', 'split'];

test('runs every city when none is named', () => {
  assert.deepEqual(parseCliArgs([], CITIES), {
    cities: CITIES,
    reencode: false,
  });
});

test('runs only the named cities, each once, in the order given', () => {
  assert.deepEqual(parseCliArgs(['split', 'vienna', 'split'], CITIES).cities, [
    'split',
    'vienna',
  ]);
});

test('reads --reencode', () => {
  assert.deepEqual(parseCliArgs(['vienna', '--reencode'], CITIES), {
    cities: ['vienna'],
    reencode: true,
  });
});

test('rejects an unknown city, listing the known ones', () => {
  assert.throws(
    () => parseCliArgs(['vienna', 'atlantis'], CITIES),
    /unknown city: atlantis \(known: vienna, graz, split\)/,
  );
});

test('rejects an unknown flag', () => {
  assert.throws(
    () => parseCliArgs(['--recheck-dead'], CITIES),
    /--recheck-dead/,
  );
});

const SOURCE = { mid: 'MID', namePrefixes: ['Graz'] };
const KML_URL = 'https://www.google.com/maps/d/kml?mid=MID&forcekml=1';
const SPOT_COORDINATES = [15.4342, 47.0739];
const SPOT_ID = spotId('Murinsel', SPOT_COORDINATES);
const JPEG = await sharp({
  create: { width: 8, height: 8, channels: 3, background: '#cc0000' },
})
  .jpeg()
  .toBuffer();

/**
 * One photo link of the test spot: its original URL, the URL of its tiny rendition, the
 * rendition's bytes (distinct per photo) and the file name they fingerprint to.
 */
function photo(name) {
  const renditionBytes = Buffer.from(`rendition of ${name}`);
  return {
    url: `https://photos.test/${name}?fife=s16383`,
    renditionUrl: `https://photos.test/${name}?fife=s32`,
    renditionBytes,
    file: photoFileName(SPOT_ID, photoFingerprint(renditionBytes)),
  };
}

const PHOTO_A = photo('A');
const PHOTO_B = photo('B');

/** A My Maps export holding the single spot "Graz: Murinsel" linking `photos`. */
function kmlWith(photos) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Graz: Murinsel</name>
      <styleUrl>#icon-1899-0288D1</styleUrl>
      <ExtendedData>
        <Data name="gx_media_links">
          <value>${photos.map(({ url }) => url).join(' ')}</value>
        </Data>
      </ExtendedData>
      <Point>
        <coordinates>${SPOT_COORDINATES.join(',')},0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>
`;
}

const kmlResponse = (text) => () =>
  new Response(text, {
    headers: { 'content-type': 'application/vnd.google-earth.kml+xml' },
  });
const imageResponse = (bytes) => () =>
  new Response(bytes, { headers: { 'content-type': 'image/jpeg' } });
const htmlResponse = () =>
  new Response('<!DOCTYPE html><html><body>consent</body></html>', {
    headers: { 'content-type': 'text/html' },
  });
const statusResponse = (status) => () => new Response(null, { status });

/** Routes serving `photos` as live: each rendition and each original answers an image. */
function live(...photos) {
  return Object.fromEntries(
    photos.flatMap(({ url, renditionUrl, renditionBytes }) => [
      [renditionUrl, imageResponse(renditionBytes)],
      [url, imageResponse(JPEG)],
    ]),
  );
}

/**
 * A fake `fetch` serving `routes` (URL → response factory) and recording every URL requested. An
 * unknown URL answers 404, a dead link: never a retried error, so no backoff sleep ever runs.
 */
function fakeWeb(routes) {
  const requested = [];
  async function fetch(url) {
    requested.push(url);
    const respond = routes[url];
    return respond ? respond() : new Response(null, { status: 404 });
  }
  return { fetch, requested };
}

/** A temporary spots folder and KML cache, removed after the test, and a runner for "graz". */
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'extract-spots-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const spotsDir = join(root, 'spots');
  const kmlCacheDir = join(root, 'cache', 'kml');
  await mkdir(spotsDir, { recursive: true });
  return {
    photoDir: join(spotsDir, 'graz'),
    geojsonPath: join(spotsDir, 'graz.geojson'),
    reportPath: join(spotsDir, 'graz.report.json'),
    cachePath: join(kmlCacheDir, 'graz.kml'),
    run: (fetch, { reencode = false } = {}) =>
      extractCity(
        'graz',
        SOURCE,
        { reencode },
        { fetch, spotsDir, kmlCacheDir },
      ),
  };
}

/** Every file a failed city must leave untouched: the outputs and the photo folder, by content. */
async function snapshot({ geojsonPath, reportPath, photoDir }) {
  const photoNames = (await readdir(photoDir)).sort();
  return {
    geojson: await readFile(geojsonPath),
    report: await readFile(reportPath),
    photos: await Promise.all(
      photoNames.map(async (name) => [
        name,
        await readFile(join(photoDir, name)),
      ]),
    ),
  };
}

test('a first run writes the GeoJSON, the report and the photo, and caches the KML', async (t) => {
  const ws = await workspace(t);
  const kmlText = kmlWith([PHOTO_A]);
  const web = fakeWeb({ [KML_URL]: kmlResponse(kmlText), ...live(PHOTO_A) });

  const { report, downloaded } = await ws.run(web.fetch);

  assert.equal(downloaded, 1);
  const collection = JSON.parse(await readFile(ws.geojsonPath, 'utf8'));
  assert.deepEqual(
    collection.features.map((feature) => feature.properties),
    [
      {
        id: SPOT_ID,
        name: 'Murinsel',
        status: 'active',
        photos: [`spots/graz/${PHOTO_A.file}`],
      },
    ],
  );
  assert.equal(await readFile(ws.reportPath, 'utf8'), toJsonText(report));
  assert.equal(report.photosWritten, 1);
  assert.deepEqual(await readdir(ws.photoDir), [PHOTO_A.file]);
  const encoded = await sharp(join(ws.photoDir, PHOTO_A.file)).metadata();
  assert.equal(encoded.format, 'webp');
  assert.equal(await readFile(ws.cachePath, 'utf8'), kmlText);
});

test('a re-run with the photo on disk fetches only its rendition', async (t) => {
  const ws = await workspace(t);
  const routes = {
    [KML_URL]: kmlResponse(kmlWith([PHOTO_A])),
    ...live(PHOTO_A),
  };
  await ws.run(fakeWeb(routes).fetch);

  const web = fakeWeb(routes);
  const { report, downloaded } = await ws.run(web.fetch);

  assert.deepEqual(web.requested, [KML_URL, PHOTO_A.renditionUrl]);
  assert.equal(downloaded, 0);
  assert.equal(report.photosWritten, 1);
});

test('--reencode downloads and encodes the original again', async (t) => {
  const ws = await workspace(t);
  const routes = {
    [KML_URL]: kmlResponse(kmlWith([PHOTO_A])),
    ...live(PHOTO_A),
  };
  await ws.run(fakeWeb(routes).fetch);

  const web = fakeWeb(routes);
  const { downloaded } = await ws.run(web.fetch, { reencode: true });

  assert.deepEqual(web.requested, [KML_URL, PHOTO_A.renditionUrl, PHOTO_A.url]);
  assert.equal(downloaded, 1);
});

test('on a first run a dead rendition and a dead original are reported, never an error', async (t) => {
  const ws = await workspace(t);
  const web = fakeWeb({
    [KML_URL]: kmlResponse(kmlWith([PHOTO_A, PHOTO_B])),
    [PHOTO_A.renditionUrl]: statusResponse(404),
    [PHOTO_B.renditionUrl]: imageResponse(PHOTO_B.renditionBytes),
    [PHOTO_B.url]: htmlResponse,
  });

  const { report } = await ws.run(web.fetch);

  assert.deepEqual(report.photosDead, [
    { spotId: SPOT_ID, index: 1, reason: 'http 404' },
    { spotId: SPOT_ID, index: 2, reason: 'content-type text/html' },
  ]);
  assert.equal(report.photosWritten, 0);
  const collection = JSON.parse(await readFile(ws.geojsonPath, 'utf8'));
  assert.deepEqual(collection.features[0].properties.photos, []);
  assert.deepEqual(await readdir(ws.photoDir), []);
});

test('a KML that does not parse fails the city and leaves the cache and the outputs untouched', async (t) => {
  const ws = await workspace(t);
  await mkdir(join(ws.cachePath, '..'), { recursive: true });
  await writeFile(ws.cachePath, 'the last KML that parsed');
  await writeFile(ws.geojsonPath, 'the previous GeoJSON');
  await writeFile(ws.reportPath, 'the previous report');
  const web = fakeWeb({ [KML_URL]: htmlResponse });

  await assert.rejects(ws.run(web.fetch), /not a KML document/);

  assert.deepEqual(web.requested, [KML_URL]);
  assert.equal(
    await readFile(ws.cachePath, 'utf8'),
    'the last KML that parsed',
  );
  assert.equal(await readFile(ws.geojsonPath, 'utf8'), 'the previous GeoJSON');
  assert.equal(await readFile(ws.reportPath, 'utf8'), 'the previous report');
});

test('a city whose photo fails writes nothing and deletes nothing', async (t) => {
  const ws = await workspace(t);
  await ws.run(
    fakeWeb({ [KML_URL]: kmlResponse(kmlWith([PHOTO_A])), ...live(PHOTO_A) })
      .fetch,
  );
  await writeFile(join(ws.photoDir, 'stale.webp'), 'unreferenced');
  const before = await snapshot(ws);
  const web = fakeWeb({
    [KML_URL]: kmlResponse(kmlWith([PHOTO_A, PHOTO_B])),
    ...live(PHOTO_A),
    [PHOTO_B.renditionUrl]: imageResponse(PHOTO_B.renditionBytes),
    [PHOTO_B.url]: imageResponse(Buffer.from('not a JPEG')),
  });

  await assert.rejects(
    ws.run(web.fetch),
    /cannot encode https:\/\/photos\.test\/B\?fife=s16383/,
  );

  assert.deepEqual(await snapshot(ws), before);
});

test('the sweep deletes unreferenced photos and .tmp leftovers', async (t) => {
  const ws = await workspace(t);
  const routes = {
    [KML_URL]: kmlResponse(kmlWith([PHOTO_A])),
    ...live(PHOTO_A),
  };
  await ws.run(fakeWeb(routes).fetch);
  await writeFile(join(ws.photoDir, 'stale.webp'), 'unreferenced');
  await writeFile(join(ws.photoDir, `${PHOTO_A.file}.123.1.tmp`), 'partial');

  await ws.run(fakeWeb(routes).fetch);

  assert.deepEqual(await readdir(ws.photoDir), [PHOTO_A.file]);
});

test('the sweep runs only after both writes, so a failed report write deletes nothing', async (t) => {
  const ws = await workspace(t);
  await mkdir(ws.photoDir, { recursive: true });
  await writeFile(join(ws.photoDir, 'stale.webp'), 'unreferenced');
  // A folder where the report goes makes its write fail after the GeoJSON's succeeded.
  await mkdir(ws.reportPath);
  const web = fakeWeb({
    [KML_URL]: kmlResponse(kmlWith([PHOTO_A])),
    ...live(PHOTO_A),
  });

  await assert.rejects(ws.run(web.fetch), /graz\.report\.json/);

  assert.ok(existsSync(join(ws.photoDir, 'stale.webp')));
});

test('a photo written last run that now comes back dead fails the city and keeps its previous files', async (t) => {
  const ws = await workspace(t);
  await ws.run(
    fakeWeb({ [KML_URL]: kmlResponse(kmlWith([PHOTO_A])), ...live(PHOTO_A) })
      .fetch,
  );
  const before = await snapshot(ws);
  const web = fakeWeb({
    [KML_URL]: kmlResponse(kmlWith([PHOTO_A])),
    [PHOTO_A.renditionUrl]: statusResponse(403),
  });

  await assert.rejects(ws.run(web.fetch), {
    message: `1 photo that was downloaded last run now comes back dead (${SPOT_ID} #1: http 403); kept the previous files — re-run later, or remove the link in My Maps if the photo is really gone`,
  });

  assert.deepEqual(await snapshot(ws), before);
});

test('the guard error lists a handful of the newly dead photos and counts the rest', async (t) => {
  const ws = await workspace(t);
  const photos = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(photo);
  await ws.run(
    fakeWeb({ [KML_URL]: kmlResponse(kmlWith(photos)), ...live(...photos) })
      .fetch,
  );
  const web = fakeWeb({ [KML_URL]: kmlResponse(kmlWith(photos)) });

  await assert.rejects(ws.run(web.fetch), {
    message: `7 photos that were downloaded last run now come back dead (${[1, 2, 3, 4, 5].map((index) => `${SPOT_ID} #${index}: http 404`).join(', ')}, and 2 more); kept the previous files — re-run later, or remove the links in My Maps if the photos are really gone`,
  });
});

test('an unreadable previous report fails the city instead of skipping the guard', async (t) => {
  const ws = await workspace(t);
  const routes = {
    [KML_URL]: kmlResponse(kmlWith([PHOTO_A])),
    ...live(PHOTO_A),
  };
  await ws.run(fakeWeb(routes).fetch);
  await writeFile(ws.reportPath, 'not JSON');
  const before = await snapshot(ws);

  await assert.rejects(ws.run(fakeWeb(routes).fetch), /graz\.report\.json/);

  assert.deepEqual(await snapshot(ws), before);
});
