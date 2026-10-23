/**
 * Checks every committed snapshot, public/spots/<city>.geojson — the bundled copy the app falls
 * back to when the backend is down. The snapshots are exported from the database by
 * `npm run snapshot:supabase` and may legitimately differ from data/spots/, so each one is
 * checked on its own: a FeatureCollection of Point features with finite, in-range coordinates,
 * ids unique across every snapshot, exactly the served record `{ id, name, status, notes,
 * photos }` in that key order (what `city_spots()` returns and `SpotProperties` reads), a known
 * status, notes as text or null, and photo keys in the `<city>/<file>.webp` shape.
 *
 * "One snapshot per supported city" stays the Karma spot-datasets.spec.ts check: Node cannot read
 * the TypeScript city list without parsing it. This lives under tools/ because it is part of
 * `test:tools`, which gates every PR build and the Pages deploy.
 */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PUBLIC_SPOTS_DIR } from './paths.mjs';

/** The served record's keys, in the order `city_spots()` writes them. */
const SERVED_KEYS = ['id', 'name', 'status', 'notes', 'photos'];
/** The values of the `spot_status` enum and of `SpotStatus`. */
const STATUSES = new Set(['active', 'demolished']);

/**
 * Every problem of one snapshot, as messages naming the city and the spot. `seenIds` collects ids
 * across snapshots, so a second city reusing an id is reported too.
 *
 * @param {string} city the file's base name
 * @param {unknown} collection the parsed file
 * @param {Map<string, string>} seenIds spot id → the city it first appeared in
 * @returns {string[]} empty when the snapshot is sound
 */
function snapshotProblems(city, collection, seenIds) {
  if (
    collection?.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features)
  ) {
    return [`${city}: not a FeatureCollection with a features array`];
  }
  const photoKey = new RegExp(`^${city}/[^/]+\\.webp$`);
  const problems = [];
  collection.features.forEach((feature, index) => {
    const id = feature?.properties?.id;
    const where = `${city}: feature #${index} (${id ?? 'no id'})`;
    if (feature?.type !== 'Feature' || feature.geometry?.type !== 'Point') {
      problems.push(`${where}: not a Point feature`);
      return;
    }
    const [lng, lat, ...rest] = feature.geometry.coordinates ?? [];
    if (
      rest.length > 0 ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      Math.abs(lng) > 180 ||
      Math.abs(lat) > 90
    ) {
      problems.push(
        `${where}: coordinates are not a finite in-range [lng, lat]`,
      );
    }
    const properties = feature.properties ?? {};
    if (
      JSON.stringify(Object.keys(properties)) !== JSON.stringify(SERVED_KEYS)
    ) {
      problems.push(
        `${where}: properties are not exactly ${SERVED_KEYS.join(', ')}`,
      );
    }
    if (typeof id !== 'string' || id === '') {
      problems.push(`${where}: id is not a non-empty string`);
    } else if (seenIds.has(id)) {
      problems.push(`${where}: id also used in ${seenIds.get(id)}`);
    } else {
      seenIds.set(id, city);
    }
    if (typeof properties.name !== 'string' || properties.name.trim() === '') {
      problems.push(`${where}: name is not a non-blank string`);
    }
    if (!STATUSES.has(properties.status)) {
      problems.push(
        `${where}: status "${properties.status}" is not active or demolished`,
      );
    }
    if (properties.notes !== null && typeof properties.notes !== 'string') {
      problems.push(`${where}: notes are neither text nor null`);
    }
    if (
      !Array.isArray(properties.photos) ||
      !properties.photos.every(
        (key) => typeof key === 'string' && photoKey.test(key),
      )
    ) {
      problems.push(`${where}: photos are not all ${city}/<file>.webp keys`);
    }
  });
  return problems;
}

const cities = readdirSync(PUBLIC_SPOTS_DIR)
  .filter((name) => name.endsWith('.geojson'))
  .map((name) => name.slice(0, -'.geojson'.length))
  .sort();

test('public/spots holds at least one snapshot', () => {
  assert.ok(cities.length > 0, `no <city>.geojson in ${PUBLIC_SPOTS_DIR}`);
});

const seenIds = new Map();
for (const city of cities) {
  test(`${city}: the committed snapshot is a sound served dataset`, () => {
    const collection = JSON.parse(
      readFileSync(join(PUBLIC_SPOTS_DIR, `${city}.geojson`), 'utf8'),
    );
    assert.deepEqual(snapshotProblems(city, collection, seenIds), []);
  });
}

/** A sound served feature of `city`, for the checks on hand-made snapshots below. */
const servedFeature = (city, id, properties = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [16.37, 48.2] },
  properties: {
    id,
    name: 'Ledge',
    status: 'active',
    notes: null,
    photos: [`${city}/${id}-0f0f0f0f.webp`],
    ...properties,
  },
});
const collectionOf = (...features) => ({ type: 'FeatureCollection', features });

test('the check passes a sound snapshot and names each fault of a broken one', () => {
  assert.deepEqual(
    snapshotProblems(
      'vienna',
      collectionOf(servedFeature('vienna', 'a-1')),
      new Map(),
    ),
    [],
  );
  const broken = collectionOf(
    {
      ...servedFeature('vienna', 'b-1'),
      geometry: { type: 'Point', coordinates: [200, 48] },
    },
    servedFeature('vienna', 'c-1', {
      status: 'gone',
      notes: 3,
      photos: ['graz/c-1.webp'],
    }),
    {
      ...servedFeature('vienna', 'd-1'),
      properties: { id: 'd-1', name: 'D', status: 'active', photos: [] },
    },
  );
  assert.deepEqual(snapshotProblems('vienna', broken, new Map()), [
    'vienna: feature #0 (b-1): coordinates are not a finite in-range [lng, lat]',
    'vienna: feature #1 (c-1): status "gone" is not active or demolished',
    'vienna: feature #1 (c-1): notes are neither text nor null',
    'vienna: feature #1 (c-1): photos are not all vienna/<file>.webp keys',
    'vienna: feature #2 (d-1): properties are not exactly id, name, status, notes, photos',
    'vienna: feature #2 (d-1): notes are neither text nor null',
  ]);
});

test('the check reports an id two snapshots share', () => {
  const ids = new Map();
  snapshotProblems('vienna', collectionOf(servedFeature('vienna', 'x-1')), ids);
  assert.deepEqual(
    snapshotProblems('graz', collectionOf(servedFeature('graz', 'x-1')), ids),
    ['graz: feature #0 (x-1): id also used in vienna'],
  );
});
