/**
 * Tests for the sync payload: one sync_spots() row per spot, built through the served-record
 * builder, with the city, dataset order, coordinates and lossless sources added.
 */
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildPayload,
  loadDatasets,
  missingPhotos,
  photoKeysOf,
} from './payload.mjs';

/** A data/spots feature as the extraction writes it. */
function feature(id, { lng = 16.37, lat = 48.2, photos = [], sources } = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id,
      name: id.toUpperCase(),
      status: 'active',
      photos,
      sources: sources ?? [{ map: 'vienna' }],
    },
  };
}

const collection = (...features) => ({ type: 'FeatureCollection', features });

test('buildPayload makes one row per spot with city, order, coordinates and served fields', () => {
  const payload = buildPayload([
    {
      city: 'vienna',
      collection: collection(
        feature('a-1', {
          lng: 16.3785491,
          lat: 48.1840844,
          photos: ['spots/vienna/a-1-00000000.webp'],
          sources: [{ map: 'vienna', description: 'big ledge' }],
        }),
        feature('b-2'),
      ),
    },
    { city: 'graz', collection: collection(feature('g-1')) },
  ]);

  assert.deepEqual(payload.cities, ['vienna', 'graz']);
  assert.deepEqual(payload.spots[0], {
    id: 'a-1',
    city: 'vienna',
    sort_order: 0,
    name: 'A-1',
    status: 'active',
    lng: 16.3785491,
    lat: 48.1840844,
    notes: 'big ledge',
    sources: [{ map: 'vienna', description: 'big ledge' }],
    photos: ['vienna/a-1-00000000.webp'],
  });
  assert.deepEqual(
    payload.spots.map(({ id, city, sort_order }) => [id, city, sort_order]),
    [
      ['a-1', 'vienna', 0],
      ['b-2', 'vienna', 1],
      ['g-1', 'graz', 0],
    ],
  );
  assert.equal(payload.spots[1].notes, null);
});

test('buildPayload refuses a spot id two cities share, naming both', () => {
  assert.throws(
    () =>
      buildPayload([
        { city: 'vienna', collection: collection(feature('x-1')) },
        { city: 'graz', collection: collection(feature('x-1')) },
      ]),
    /spot id x-1 appears in both vienna and graz/,
  );
});

test('buildPayload refuses a spot id repeated inside one city', () => {
  assert.throws(
    () =>
      buildPayload([
        {
          city: 'vienna',
          collection: collection(feature('x-1'), feature('x-1')),
        },
      ]),
    /spot id x-1 appears twice in vienna/,
  );
});

test('photoKeysOf lists every photo key in payload order', () => {
  const payload = buildPayload([
    {
      city: 'vienna',
      collection: collection(
        feature('a-1', {
          photos: ['spots/vienna/a-1-1.webp', 'spots/vienna/a-1-2.webp'],
        }),
        feature('b-2', { photos: ['spots/vienna/b-2-1.webp'] }),
      ),
    },
  ]);

  assert.deepEqual(photoKeysOf(payload), [
    'vienna/a-1-1.webp',
    'vienna/a-1-2.webp',
    'vienna/b-2-1.webp',
  ]);
});

test('loadDatasets reads each city in registry order; missingPhotos names absent files', async (t) => {
  const spotsDir = await mkdtemp(join(tmpdir(), 'sync-supabase-payload-'));
  t.after(() => rm(spotsDir, { recursive: true, force: true }));
  await writeFile(
    join(spotsDir, 'vienna.geojson'),
    JSON.stringify(collection(feature('a-1'))),
  );
  await writeFile(
    join(spotsDir, 'graz.geojson'),
    JSON.stringify(collection(feature('g-1'))),
  );
  await mkdir(join(spotsDir, 'vienna'));
  await writeFile(join(spotsDir, 'vienna', 'here.webp'), 'x');

  const datasets = await loadDatasets({ spotsDir, cities: ['graz', 'vienna'] });

  assert.deepEqual(
    datasets.map(({ city, collection: { features } }) => [
      city,
      features[0].properties.id,
    ]),
    [
      ['graz', 'g-1'],
      ['vienna', 'a-1'],
    ],
  );
  assert.deepEqual(
    missingPhotos(['vienna/here.webp', 'vienna/gone.webp'], spotsDir),
    ['vienna/gone.webp'],
  );
});
