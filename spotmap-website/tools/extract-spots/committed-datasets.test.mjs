/**
 * Proves the snapshots the app is served match the datasets they are promoted from.
 *
 * For every city in data/spots/sources.json it reads the real committed files, not fixtures:
 * public/spots/<city>.geojson (the bundled snapshot, and the fallback when the backend is down)
 * and data/spots/<city>.geojson (the lossless record). A snapshot must hold the same spots in the
 * same order, carry exactly the served record `servedProperties` builds from each dataset spot
 * (photo keys, notes, status, name, id) and keep each spot's coordinates. So a dataset edited
 * without `npm run promote:spots`, or a snapshot edited by hand, fails here.
 *
 * It lives under tools/ because Karma serves only public/, so a spec under src/ cannot read
 * data/spots/. promote.test.mjs covers the promotion logic on fixtures; this covers the committed
 * output.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PUBLIC_SPOTS_DIR, SPOTS_DIR } from './promote.mjs';
import { servedProperties } from './served-record.mjs';

const readGeoJson = (directory, city) =>
  JSON.parse(readFileSync(join(directory, `${city}.geojson`), 'utf8'));

const { cities } = JSON.parse(
  readFileSync(join(SPOTS_DIR, 'sources.json'), 'utf8'),
);

for (const city of Object.keys(cities)) {
  test(`${city}: the served snapshot matches the committed dataset`, () => {
    const dataset = readGeoJson(SPOTS_DIR, city).features;
    const snapshot = readGeoJson(PUBLIC_SPOTS_DIR, city).features;

    assert.deepEqual(
      snapshot.map(({ properties }) => properties.id),
      dataset.map(({ properties }) => properties.id),
      `${city}: the snapshot lists different spots, or in a different order, than the dataset`,
    );

    dataset.forEach((spot, index) => {
      const served = snapshot[index];
      const { id } = spot.properties;
      assert.deepEqual(
        served.properties,
        servedProperties(spot.properties),
        `${city}: spot "${id}" has a served record that differs from its dataset record`,
      );
      assert.deepEqual(
        served.geometry.coordinates,
        spot.geometry.coordinates,
        `${city}: spot "${id}" has different coordinates than its dataset record`,
      );
    });
  });
}
