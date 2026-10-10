/**
 * Tests for the promote step: the served copy of a city's dataset keeps each spot's id, name,
 * status and geometry and nothing else, it is written where the app loads it, and the
 * `promote:spots` CLI promotes the named cities or every city, offline. Every test writes into
 * its own temporary folders, never into the real public/spots/.
 */
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { toJsonText } from './dataset.mjs';
import { promoteCity, promoteCollection, runPromotion } from './promote.mjs';

/** A lossless dataset as the extraction writes it: photos, sources with notes and folders. */
const DATASET = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [15.4364, 47.0707] },
      properties: {
        id: 'murinsel-a1b2c3',
        name: 'Murinsel',
        status: 'active',
        photos: ['spots/graz/murinsel-a1b2c3-0f0f0f0f.webp'],
        sources: [
          { map: 'graz', folder: 'Graz', description: 'ledges by the river' },
        ],
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [15.44, 47.07] },
      properties: {
        id: 'old-bank-d4e5f6',
        name: 'Old Bank',
        status: 'demolished',
        photos: [],
        sources: [{ map: 'graz' }],
      },
    },
  ],
};

/** Temporary data and public folders, removed after the test, both created up front. */
async function folders(t) {
  const root = await mkdtemp(join(tmpdir(), 'extract-spots-promote-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const spotsDir = join(root, 'data');
  const publicDir = join(root, 'public');
  await mkdir(spotsDir);
  await mkdir(publicDir);
  return { spotsDir, publicDir };
}

/** Silences the CLI's console output for one test. */
function quiet(t) {
  for (const method of ['log', 'error']) {
    t.mock.method(console, method, () => {});
  }
}

test('promoteCollection keeps id, name and status, empties photos and drops sources', () => {
  const promoted = promoteCollection(DATASET);
  assert.deepEqual(
    promoted.features.map((feature) => feature.properties),
    [
      { id: 'murinsel-a1b2c3', name: 'Murinsel', status: 'active', photos: [] },
      {
        id: 'old-bank-d4e5f6',
        name: 'Old Bank',
        status: 'demolished',
        photos: [],
      },
    ],
  );
  assert.deepEqual(Object.keys(promoted.features[0].properties), [
    'id',
    'name',
    'status',
    'photos',
  ]);
});

test('promoteCollection keeps the collection and feature shape and every geometry', () => {
  const promoted = promoteCollection(DATASET);
  assert.deepEqual(Object.keys(promoted), ['type', 'features']);
  assert.equal(promoted.type, 'FeatureCollection');
  assert.deepEqual(Object.keys(promoted.features[0]), [
    'type',
    'geometry',
    'properties',
  ]);
  assert.deepEqual(
    promoted.features.map((feature) => feature.geometry),
    DATASET.features.map((feature) => feature.geometry),
  );
});

test('promoteCollection leaves its input untouched', () => {
  const before = structuredClone(DATASET);
  promoteCollection(DATASET);
  assert.deepEqual(DATASET, before);
});

test('promoteCity writes the promoted dataset into the public folder as pretty JSON', async (t) => {
  const { spotsDir, publicDir } = await folders(t);
  await writeFile(join(spotsDir, 'graz.geojson'), toJsonText(DATASET));

  await promoteCity('graz', { spotsDir, publicDir });

  assert.equal(
    await readFile(join(publicDir, 'graz.geojson'), 'utf8'),
    toJsonText(promoteCollection(DATASET)),
  );
});

test('runPromotion with no city promotes every city', async (t) => {
  quiet(t);
  const { spotsDir, publicDir } = await folders(t);
  for (const city of ['graz', 'linz']) {
    await writeFile(join(spotsDir, `${city}.geojson`), toJsonText(DATASET));
  }

  const code = await runPromotion([], {
    cities: ['graz', 'linz'],
    spotsDir,
    publicDir,
  });

  assert.equal(code, 0);
  assert.ok(existsSync(join(publicDir, 'graz.geojson')));
  assert.ok(existsSync(join(publicDir, 'linz.geojson')));
});

test('runPromotion promotes only the named cities', async (t) => {
  quiet(t);
  const { spotsDir, publicDir } = await folders(t);
  for (const city of ['graz', 'linz']) {
    await writeFile(join(spotsDir, `${city}.geojson`), toJsonText(DATASET));
  }

  const code = await runPromotion(['linz'], {
    cities: ['graz', 'linz'],
    spotsDir,
    publicDir,
  });

  assert.equal(code, 0);
  assert.equal(existsSync(join(publicDir, 'graz.geojson')), false);
  assert.ok(existsSync(join(publicDir, 'linz.geojson')));
});

test('runPromotion exits 2 on an unknown city and writes nothing', async (t) => {
  quiet(t);
  const { spotsDir, publicDir } = await folders(t);
  await writeFile(join(spotsDir, 'graz.geojson'), toJsonText(DATASET));

  const code = await runPromotion(['graz', 'gratz'], {
    cities: ['graz'],
    spotsDir,
    publicDir,
  });

  assert.equal(code, 2);
  assert.equal(existsSync(join(publicDir, 'graz.geojson')), false);
});

test('runPromotion exits 2 on an unknown flag', async (t) => {
  quiet(t);
  const { spotsDir, publicDir } = await folders(t);

  const code = await runPromotion(['--reencode'], {
    cities: ['graz'],
    spotsDir,
    publicDir,
  });

  assert.equal(code, 2);
});

test('runPromotion exits 1 on a missing dataset and still promotes the other cities', async (t) => {
  quiet(t);
  const { spotsDir, publicDir } = await folders(t);
  await writeFile(join(spotsDir, 'linz.geojson'), toJsonText(DATASET));

  const code = await runPromotion([], {
    cities: ['graz', 'linz'],
    spotsDir,
    publicDir,
  });

  assert.equal(code, 1);
  assert.ok(existsSync(join(publicDir, 'linz.geojson')));
});
