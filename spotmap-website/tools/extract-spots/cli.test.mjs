/**
 * Tests for the extraction CLI: argument handling, one city's extraction, and whole runs over a
 * registry with a shared and an extra map, against a fake web in a temporary folder. An unknown
 * city must fail before any network call, so a typo never costs a full run; a city that fails
 * before its writes must leave its previous GeoJSON, report and photos untouched, and no city ever
 * writes outside data/spots (the bundled snapshots come from the database).
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
import { extractCity, parseCliArgs, runExtraction } from './cli.mjs';
import { toJsonText } from './dataset.mjs';
import { photoFileName, spotId } from './ids.mjs';
import { photoFingerprint } from './photos.mjs';

const CITIES = ['vienna', 'graz', 'split'];

test('runs every city when none is named', () => {
  assert.deepEqual(parseCliArgs([], CITIES), {
    cities: CITIES,
    reencode: false,
    allCities: true,
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
    allCities: false,
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

const SOURCE = { map: 'graz', namePrefixes: ['Graz'] };
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

/** `fakeWeb` handlers: `htmlResponse` is one; the others take a body or status and return one. */
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

/**
 * A temporary spots folder, an empty public folder (which no run may write into) and a KML cache,
 * removed after the test, their paths and those of "graz"'s outputs, and a runner for "graz" whose
 * map `graz` has the id `MID`.
 */
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'extract-spots-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const spotsDir = join(root, 'spots');
  const kmlCacheDir = join(root, 'cache', 'kml');
  const publicDir = join(root, 'public');
  await mkdir(spotsDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });
  return {
    root,
    spotsDir,
    publicDir,
    kmlCacheDir,
    photoDir: join(spotsDir, 'graz'),
    geojsonPath: join(spotsDir, 'graz.geojson'),
    reportPath: join(spotsDir, 'graz.report.json'),
    cachePath: join(kmlCacheDir, 'graz.kml'),
    run: (fetch, { reencode = false } = {}) =>
      extractCity(
        'graz',
        SOURCE,
        { reencode },
        { maps: { graz: 'MID' }, fetch, spotsDir, kmlCacheDir },
      ),
  };
}

/**
 * Every file a failed city must leave untouched: the data file, the report and the photo folder, by
 * content.
 */
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
        sources: [{ map: 'graz' }],
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
    { spotId: SPOT_ID, map: 'graz', n: 1, reason: 'http 404' },
    { spotId: SPOT_ID, map: 'graz', n: 2, reason: 'content-type text/html' },
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

test('a successful city writes only into the spots folder, never the public one', async (t) => {
  const ws = await workspace(t);
  await ws.run(
    fakeWeb({ [KML_URL]: kmlResponse(kmlWith([PHOTO_A])), ...live(PHOTO_A) })
      .fetch,
  );

  assert.ok(existsSync(ws.geojsonPath), 'graz.geojson was not written');
  assert.deepEqual(
    await readdir(ws.publicDir),
    [],
    'the extractor wrote into the public folder; only snapshot:supabase may',
  );
  assert.deepEqual((await readdir(ws.root)).sort(), [
    'cache',
    'public',
    'spots',
  ]);
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
    message: `1 photo that was downloaded last run now comes back dead (${SPOT_ID} graz#1: http 403); kept the previous files — re-run later, or remove the link in My Maps if the photo is really gone`,
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
    message: `7 photos that were downloaded last run now come back dead (${[1, 2, 3, 4, 5].map((n) => `${SPOT_ID} graz#${n}: http 404`).join(', ')}, and 2 more); kept the previous files — re-run later, or remove the links in My Maps if the photos are really gone`,
  });
});

for (const [field, damaged] of [
  ['photosRecovered', {}],
  ['photosNearDuplicate', 'none'],
  ['linkCounts', []],
]) {
  test(`a previous report whose ${field} is damaged fails the city and changes nothing`, async (t) => {
    const ws = await workspace(t);
    const web = fakeWeb({
      [KML_URL]: kmlResponse(kmlWith([PHOTO_A])),
      ...live(PHOTO_A),
    });
    await ws.run(web.fetch);
    const report = JSON.parse(await readFile(ws.reportPath, 'utf8'));
    await writeFile(ws.reportPath, toJsonText({ ...report, [field]: damaged }));
    const before = await snapshot(ws);

    await assert.rejects(ws.run(web.fetch), new RegExp(field));
    assert.deepEqual(await snapshot(ws), before);
  });
}

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

const BALKAN_URL = 'https://www.google.com/maps/d/kml?mid=BMID&forcekml=1';
const SPLIT_URL = 'https://www.google.com/maps/d/kml?mid=SMID&forcekml=1';
const RIVA = [16.44, 43.508];

/** A My Maps export holding `placemarks` ({ name, coordinates, urls }) in one folder. */
function kmlOf(placemarks) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      <name>Kroatien</name>
${placemarks
  .map(
    ({ name, coordinates, urls = [] }) => `      <Placemark>
        <name>${name}</name>
        <styleUrl>#icon-1899-0288D1</styleUrl>
        <ExtendedData>
          <Data name="gx_media_links">
            <value>${urls.join(' ')}</value>
          </Data>
        </ExtendedData>
        <Point>
          <coordinates>${coordinates.join(',')},0</coordinates>
        </Point>
      </Placemark>`,
  )
  .join('\n')}
    </Folder>
  </Document>
</kml>
`;
}

/** A live photo link of spot `id`: routes for its rendition and original, and its file name. */
function photoOf(id, name) {
  const renditionBytes = Buffer.from(`rendition of ${name}`);
  const url = `https://photos.test/${name}?fife=s16383`;
  return {
    url,
    file: photoFileName(id, photoFingerprint(renditionBytes)),
    routes: {
      [`https://photos.test/${name}?fife=s32`]: imageResponse(renditionBytes),
      [url]: imageResponse(JPEG),
    },
  };
}

const REGISTRY = {
  maps: { split: 'SMID', balkan: 'BMID' },
  cities: {
    split: { map: 'split', namePrefixes: ['Split'], extraMaps: ['balkan'] },
    zadar: { map: 'balkan', namePrefixes: ['Zadar'], onlyPrefixed: true },
  },
};
const RIVA_ID = spotId('Riva', RIVA);
const LEDGE = [15.23, 44.11];
const LEDGE_ID = spotId('Ledge', LEDGE);

/** Split's own map (Riva, its photo dead) and Balkan (Riva with a live photo, Zadar: Ledge). */
function balkanWeb({ splitMain = [], balkanRiva = [], extra = {} } = {}) {
  const live = photoOf(RIVA_ID, 'riva-balkan');
  const ledge = photoOf(LEDGE_ID, 'ledge');
  return {
    live,
    ledge,
    web: fakeWeb({
      [SPLIT_URL]: kmlResponse(
        kmlOf([
          {
            name: 'Split: Riva',
            coordinates: RIVA,
            urls: ['https://photos.test/dead?fife=s16383', ...splitMain],
          },
        ]),
      ),
      [BALKAN_URL]: kmlResponse(
        kmlOf([
          {
            name: 'Split: Riva',
            coordinates: [16.4401, 43.508],
            urls: [live.url, ...balkanRiva],
          },
          { name: 'Zadar: Ledge', coordinates: LEDGE, urls: [ledge.url] },
        ]),
      ),
      ...live.routes,
      ...ledge.routes,
      ...extra,
    }),
  };
}

/**
 * Runs the CLI over `REGISTRY` in `ws` (a fresh workspace by default), console silenced (once per
 * test).
 */
async function runIn(t, argv, web, ws = undefined) {
  for (const method of ['log', 'table', 'warn', 'error']) {
    if (console[method].mock === undefined) {
      t.mock.method(console, method, () => {});
    }
  }
  ws ??= await workspace(t);
  const code = await runExtraction(argv, {
    registry: REGISTRY,
    fetch: web.fetch,
    spotsDir: ws.spotsDir,
    kmlCacheDir: ws.kmlCacheDir,
  });
  assert.deepEqual(
    await readdir(ws.publicDir),
    [],
    'a run wrote into the public folder',
  );
  const read = async (name) =>
    JSON.parse(await readFile(join(ws.spotsDir, name), 'utf8'));
  return { code, ws, read };
}

test('an extra map adds its photos and a source record, and recovers the dead main photo', async (t) => {
  const { live, web } = balkanWeb();
  const { code, read } = await runIn(t, ['split'], web);
  assert.equal(code, 0);
  const [riva] = (await read('split.geojson')).features;
  assert.deepEqual(riva.properties.photos, [`spots/split/${live.file}`]);
  assert.deepEqual(riva.properties.sources, [
    { map: 'split', folder: 'Kroatien' },
    { map: 'balkan', folder: 'Kroatien', position: [16.4401, 43.508] },
  ]);
  assert.deepEqual(riva.geometry.coordinates, RIVA);
  const report = await read('split.report.json');
  assert.equal(report.photosRecovered.length, 1);
  assert.deepEqual(report.photosDead, []);
  assert.deepEqual(report.extraMaps, [
    { map: 'balkan', mid: 'BMID', placemarks: 2, matched: 1 },
  ]);
});

test('an onlyPrefixed city keeps only its own placemarks of the shared map', async (t) => {
  const { ledge, web } = balkanWeb();
  const { code, read } = await runIn(t, ['zadar'], web);
  assert.equal(code, 0);
  const collection = await read('zadar.geojson');
  assert.deepEqual(
    collection.features.map(({ properties }) => [
      properties.name,
      properties.photos,
    ]),
    [['Ledge', [`spots/zadar/${ledge.file}`]]],
  );
  assert.equal((await read('zadar.report.json')).placemarks, 1);
});

test('a map several cities use is fetched once per run', async (t) => {
  const { web } = balkanWeb();
  await runIn(t, ['split', 'zadar'], web);
  assert.equal(web.requested.filter((url) => url === BALKAN_URL).length, 1);
});

test('an extra-map photo that looks like a kept main photo is left out of the GeoJSON but kept on disk', async (t) => {
  const main = photoOf(RIVA_ID, 'riva-main');
  const { live, web } = balkanWeb({
    splitMain: [main.url],
    extra: main.routes,
  });
  const { code, ws, read } = await runIn(t, ['split'], web);
  assert.equal(code, 0);
  // Every original is the same red JPEG, so the Balkan copy hashes identically to the main one.
  const [riva] = (await read('split.geojson')).features;
  assert.deepEqual(riva.properties.photos, [`spots/split/${main.file}`]);
  const report = await read('split.report.json');
  assert.deepEqual(
    report.photosNearDuplicate.map(({ map, n, distance }) => [
      map,
      n,
      distance,
    ]),
    [['balkan', 1, 0]],
  );
  assert.deepEqual(
    (await readdir(join(ws.spotsDir, 'split'))).sort(),
    [live.file, main.file].sort(),
  );
});

test('a failing extra map fails the city, naming the map, and leaves no outputs', async (t) => {
  const { web } = balkanWeb({ extra: { [BALKAN_URL]: statusResponse(404) } });
  const { code, ws } = await runIn(t, ['split'], web);
  assert.equal(code, 1);
  assert.equal(existsSync(join(ws.spotsDir, 'split.geojson')), false);
  assert.match(
    console.error.mock.calls
      .map(({ arguments: args }) => args.join(' '))
      .join('\n'),
    /split: FAILED — map balkan: KML export answered http 404/,
  );
});

test('a failing main map fails the city, naming the map', async (t) => {
  const { web } = balkanWeb({ extra: { [SPLIT_URL]: statusResponse(404) } });
  const { code } = await runIn(t, ['split'], web);
  assert.equal(code, 1);
  assert.match(
    console.error.mock.calls
      .map(({ arguments: args }) => args.join(' '))
      .join('\n'),
    /split: FAILED — map split: KML export answered http 404/,
  );
});

test('a run over every city writes the map report of each shared or extra map', async (t) => {
  const { web } = balkanWeb();
  const { code, read } = await runIn(t, [], web);
  assert.equal(code, 0);
  assert.deepEqual(await read('balkan.map-report.json'), {
    map: 'balkan',
    mid: 'BMID',
    placemarks: 2,
    unclaimed: [],
    multiplyClaimed: [],
  });
});

test('a run naming cities, or one where a city fails, writes no map report', async (t) => {
  const named = await runIn(t, ['split', 'zadar'], balkanWeb().web);
  assert.equal(
    existsSync(join(named.ws.spotsDir, 'balkan.map-report.json')),
    false,
  );
  const failing = await runIn(
    t,
    [],
    balkanWeb({ extra: { [SPLIT_URL]: statusResponse(404) } }).web,
  );
  assert.equal(failing.code, 1);
  assert.equal(
    existsSync(join(failing.ws.spotsDir, 'balkan.map-report.json')),
    false,
  );
});

test('an unknown city exits 2 before any request', async (t) => {
  const { web } = balkanWeb();
  const { code } = await runIn(t, ['atlantis'], web);
  assert.equal(code, 2);
  assert.deepEqual(web.requested, []);
});

test('a spot an extra map fed last run that now loses its match fails the city and keeps its files', async (t) => {
  const first = balkanWeb();
  const { ws } = await runIn(t, ['split'], first.web);
  const outputs = {
    geojsonPath: join(ws.spotsDir, 'split.geojson'),
    reportPath: join(ws.spotsDir, 'split.report.json'),
    photoDir: join(ws.spotsDir, 'split'),
  };
  const before = await snapshot(outputs);
  // Without its prefix and some 240 m off, Balkan's Riva is a conflict the merge leaves out.
  const moved = fakeWeb({
    [SPLIT_URL]: kmlResponse(
      kmlOf([
        {
          name: 'Split: Riva',
          coordinates: RIVA,
          urls: ['https://photos.test/dead?fife=s16383'],
        },
      ]),
    ),
    [BALKAN_URL]: kmlResponse(
      kmlOf([
        { name: 'Riva', coordinates: [16.443, 43.508], urls: [first.live.url] },
      ]),
    ),
    ...first.live.routes,
  });

  const { code } = await runIn(t, ['split'], moved, ws);

  assert.equal(code, 1);
  assert.match(
    console.error.mock.calls
      .map(({ arguments: args }) => args.join(' '))
      .join('\n'),
    new RegExp(
      `split: FAILED — 1 spot an extra map fed last run lost its match \\(${RIVA_ID} ← balkan placemark #0 "Riva"\\)`,
    ),
  );
  assert.deepEqual(await snapshot(outputs), before);
});

test('a spot whose Balkan placemark was renamed and moved off it fails the city and keeps its files', async (t) => {
  const first = balkanWeb();
  const { ws } = await runIn(t, ['split'], first.web);
  const outputs = {
    geojsonPath: join(ws.spotsDir, 'split.geojson'),
    reportPath: join(ws.spotsDir, 'split.report.json'),
    photoDir: join(ws.spotsDir, 'split'),
  };
  const before = await snapshot(outputs);
  // Still prefixed, but neither its name nor its position (some 240 m off) matches Riva now.
  const renamed = fakeWeb({
    [SPLIT_URL]: kmlResponse(
      kmlOf([
        {
          name: 'Split: Riva',
          coordinates: RIVA,
          urls: ['https://photos.test/dead?fife=s16383'],
        },
      ]),
    ),
    [BALKAN_URL]: kmlResponse(
      kmlOf([
        {
          name: 'Split: Riva Steps',
          coordinates: [16.443, 43.508],
          urls: [first.live.url],
        },
      ]),
    ),
    ...first.live.routes,
  });

  const { code } = await runIn(t, ['split'], renamed, ws);

  assert.equal(code, 1);
  assert.match(
    console.error.mock.calls
      .map(({ arguments: args }) => args.join(' '))
      .join('\n'),
    new RegExp(
      `split: FAILED — 1 spot an extra map fed last run lost its match \\(${RIVA_ID} ← balkan placemark "Riva"\\)`,
    ),
  );
  assert.deepEqual(await snapshot(outputs), before);
});

test('a spot whose only Balkan placemark was deleted loses its Balkan photos without failing', async (t) => {
  const first = balkanWeb();
  const { ws, read } = await runIn(t, ['split'], first.web);
  const deleted = fakeWeb({
    [SPLIT_URL]: kmlResponse(
      kmlOf([
        {
          name: 'Split: Riva',
          coordinates: RIVA,
          urls: ['https://photos.test/dead?fife=s16383'],
        },
      ]),
    ),
    [BALKAN_URL]: kmlResponse(
      kmlOf([
        { name: 'Zadar: Ledge', coordinates: LEDGE, urls: [first.ledge.url] },
      ]),
    ),
    ...first.ledge.routes,
  });

  const { code } = await runIn(t, ['split'], deleted, ws);

  assert.equal(code, 0);
  const [riva] = (await read('split.geojson')).features;
  assert.deepEqual(riva.properties.photos, []);
});

test('a placemark whose notes carry a URL fails the city and writes no output', async (t) => {
  const ws = await workspace(t);
  const kmlText = kmlWith([PHOTO_A]).replace(
    '<name>Graz: Murinsel</name>',
    '<name>Graz: Murinsel</name>\n      <description>video: https://videos.test/murinsel</description>',
  );
  const web = fakeWeb({ [KML_URL]: kmlResponse(kmlText), ...live(PHOTO_A) });

  await assert.rejects(
    ws.run(web.fetch),
    /sources\[0\]\.description carries a URL/,
  );

  assert.equal(existsSync(ws.geojsonPath), false);
  assert.equal(existsSync(ws.reportPath), false);
});
