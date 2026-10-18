/**
 * Tests for the insert-only sync command: the target guard, the order of its steps (read the
 * database, plan, photos, then one insert), what it prints, --dry-run, --expect-no-inserts,
 * --db-only, uploads of only the missing objects of the spots it inserts, and stopping with exit 1
 * at the first failure. The Supabase client is a fake over an in-memory database and bucket that
 * records every call; datasets, photos and thumbnails live in temporary folders.
 */
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isLocalUrl, parseSyncArgs, runSync } from './cli.mjs';

const LOCAL = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};
const HOSTED = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};
const PHOTOS = ['graz/a-1-11111111.webp', 'graz/b-2-22222222.webp'];
/** Metres per degree of latitude on the haversine sphere: a pure latitude offset is exact. */
const M_PER_DEGREE_LAT = (6_371_000 * Math.PI) / 180;

/**
 * A data/spots folder with one city, graz: spot `a-1` at (15.43, 47.07), `b-2` one degree of
 * longitude east, each linking one of `photos` (default: the two PHOTOS), on disk unless
 * `withPhotos` is false.
 */
async function workspace(t, { withPhotos = true, photos = PHOTOS } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sync-supabase-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const spotsDir = join(root, 'spots');
  const thumbsDir = join(root, 'thumbs');
  await mkdir(join(spotsDir, 'graz'), { recursive: true });
  const features = photos.map((key, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [15.43 + i, 47.07] },
    properties: {
      id: key.split('/')[1].slice(0, 3),
      name: `Spot ${i}`,
      status: 'active',
      photos: [`spots/${key}`],
      sources: [{ map: 'graz' }],
    },
  }));
  await writeFile(
    join(spotsDir, 'graz.geojson'),
    JSON.stringify({ type: 'FeatureCollection', features }),
  );
  if (withPhotos) {
    for (const key of photos) {
      await writeFile(join(spotsDir, key), `full ${key}`);
    }
  }
  return { spotsDir, thumbsDir };
}

/** A thumbnail deriver that writes a recognisable stand-in instead of running sharp. */
const fakeDerive = async (source, out) => {
  await writeFile(out, `thumb of ${source.split('/').slice(-2).join('/')}`);
};

/** A `sync_existing_spots()` row in graz, by default exactly where the workspace puts `a-1`. */
function existingSpot(
  id,
  { lng = 15.43, lat = 47.07, name = `Existing ${id}`, deleted = false } = {},
) {
  return { id, city: 'graz', name, lng, lat, deleted };
}

/**
 * A fake client over an in-memory database (`existing` rows, `cities` slugs) and bucket
 * (`remote` keys). `sync_insert_spots` adds to both, so a second run sees the first run's result;
 * the rpc named `failingRpc` throws as a failed request would.
 */
function fakeSupabase({
  existing = [],
  cities = [],
  remote = new Set(),
  failingRpc,
} = {}) {
  const calls = [];
  const knownCities = new Set(cities);
  const client = {
    async rpc(name, body) {
      calls.push(['rpc', name, body]);
      if (name === failingRpc) {
        throw new Error(`rpc ${name}: HTTP 400 boom`);
      }
      if (name === 'sync_existing_spots') {
        return existing.map((row) => ({ ...row }));
      }
      if (name === 'sync_insert_spots') {
        const { cities: slugs, spots } = body.payload;
        const newCities = slugs.filter((slug) => !knownCities.has(slug));
        newCities.forEach((slug) => knownCities.add(slug));
        for (const spot of spots) {
          existing.push(existingSpot(spot.id, spot));
        }
        return {
          cities: { inserted: newCities.length },
          spots: { inserted: spots.length },
          photos: { inserted: spots.flatMap(({ photos }) => photos).length },
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    async listFolder(folder) {
      calls.push(['list', folder]);
      return [...remote]
        .filter((key) => key.startsWith(`${folder}/`))
        .map((key) => ({ name: key.slice(folder.length + 1), folder: false }));
    },
    async upload(key) {
      calls.push(['upload', key]);
      remote.add(key);
    },
  };
  return { calls, existing, remote, createClient: () => client };
}

/** Each call as one string: `rpc <name>`, `list <folder>` or `upload <key>`. */
const callNames = (calls) => calls.map(([kind, what]) => `${kind} ${what}`);
/** The keys uploaded, sorted. */
const uploadsOf = (calls) =>
  calls
    .filter(([kind]) => kind === 'upload')
    .map(([, key]) => key)
    .sort();
/** The body of the last sync_insert_spots call. */
const insertBody = (calls) =>
  calls.findLast(
    ([kind, name]) => kind === 'rpc' && name === 'sync_insert_spots',
  )[2];

/** Runs the sync with captured output. */
async function sync(argv, { env = LOCAL, ws, supabase, cities = ['graz'] }) {
  const lines = [];
  const code = await runSync(argv, {
    env,
    cities,
    spotsDir: ws.spotsDir,
    thumbsDir: ws.thumbsDir,
    createClient: supabase.createClient,
    derive: fakeDerive,
    log: (line) => lines.push(line),
    error: (line) => lines.push(`ERR ${line}`),
  });
  return { code, lines };
}

test('parseSyncArgs reads the four flags and rejects anything else', () => {
  assert.deepEqual(parseSyncArgs([]), {
    dryRun: false,
    dbOnly: false,
    hosted: false,
    expectNoInserts: false,
  });
  assert.deepEqual(
    parseSyncArgs([
      '--dry-run',
      '--db-only',
      '--hosted',
      '--expect-no-inserts',
    ]),
    { dryRun: true, dbOnly: true, hosted: true, expectNoInserts: true },
  );
  assert.throws(() => parseSyncArgs(['--force']), /--force/);
  assert.throws(() => parseSyncArgs(['graz']));
});

test('isLocalUrl knows the local stack and nothing else', () => {
  assert.equal(isLocalUrl('http://127.0.0.1:54321'), true);
  assert.equal(isLocalUrl('http://localhost:54321'), true);
  assert.equal(isLocalUrl('https://abcdefgh.supabase.co'), false);
});

test('a hosted project without --hosted is refused before anything is touched', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase();
  const { code, lines } = await sync([], { env: HOSTED, ws, supabase });
  assert.equal(code, 2);
  assert.deepEqual(supabase.calls, []);
  assert.match(lines.join('\n'), /pass --hosted/);
});

test('--hosted against the local stack is refused too', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase();
  const { code } = await sync(['--hosted'], { ws, supabase });
  assert.equal(code, 2);
  assert.deepEqual(supabase.calls, []);
});

test('a missing or publishable key is refused', async (t) => {
  const ws = await workspace(t);
  for (const env of [
    { SUPABASE_URL: LOCAL.SUPABASE_URL },
    { ...LOCAL, SUPABASE_SECRET_KEY: 'sb_publishable_x' },
  ]) {
    const supabase = fakeSupabase();
    const { code } = await sync([], { env, ws, supabase });
    assert.equal(code, 2);
    assert.deepEqual(supabase.calls, []);
  }
});

test('an unknown flag exits 2', async (t) => {
  const ws = await workspace(t);
  const { code } = await sync(['--force'], { ws, supabase: fakeSupabase() });
  assert.equal(code, 2);
});

test('a first run reads the empty database, uploads every photo, then inserts every spot', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase();

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 0);
  assert.deepEqual(lines, [
    'target: 127.0.0.1:54321 (local stack)',
    'load: 1 cities, 2 spots, 2 photos',
    'plan: 0 already present, 0 possible duplicates, 2 to insert',
    'insert: a-1 (graz)',
    'insert: b-2 (graz)',
    'thumbnails: 2 derived, 0 deleted',
    'upload: 4 of 4 objects uploaded',
    'database: 1 cities, 2 spots, 2 photos inserted',
  ]);
  for (const key of PHOTOS) {
    assert.ok(existsSync(join(ws.thumbsDir, key)), `thumbnail ${key}`);
  }
  const names = callNames(supabase.calls);
  assert.equal(names[0], 'rpc sync_existing_spots');
  assert.deepEqual(supabase.calls[0][2], {});
  assert.equal(names.at(-1), 'rpc sync_insert_spots');
  assert.deepEqual(uploadsOf(supabase.calls), [
    'full/graz/a-1-11111111.webp',
    'full/graz/b-2-22222222.webp',
    'thumb/graz/a-1-11111111.webp',
    'thumb/graz/b-2-22222222.webp',
  ]);
  const { payload } = insertBody(supabase.calls);
  assert.deepEqual(payload.cities, ['graz']);
  assert.deepEqual(
    payload.spots.map(({ id, photos }) => [id, photos]),
    [
      ['a-1', [PHOTOS[0]]],
      ['b-2', [PHOTOS[1]]],
    ],
  );
  assert.deepEqual(Object.keys(payload.spots[0]), [
    'id',
    'city',
    'name',
    'status',
    'lng',
    'lat',
    'notes',
    'sources',
    'photos',
  ]);
});

test('a re-run with unchanged data inserts, derives and uploads nothing', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase();
  await sync([], { ws, supabase });
  supabase.calls.length = 0;

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 0);
  assert.deepEqual(lines.slice(1), [
    'load: 1 cities, 2 spots, 2 photos',
    'plan: 2 already present, 0 possible duplicates, 0 to insert',
    'thumbnails: 0 derived, 0 deleted',
    'upload: 0 of 0 objects uploaded',
    'database: 0 cities, 0 spots, 0 photos inserted',
  ]);
  assert.deepEqual(callNames(supabase.calls), [
    'rpc sync_existing_spots',
    'rpc sync_insert_spots',
  ]);
  assert.deepEqual(insertBody(supabase.calls).payload.spots, []);
});

test('a spot the database holds is left alone, even moved, renamed and deleted there; only the new spot’s missing objects upload', async (t) => {
  const ws = await workspace(t);
  const edited = existingSpot('a-1', {
    lng: 2.2,
    lat: 41.4,
    name: 'Renamed',
    deleted: true,
  });
  const supabase = fakeSupabase({
    existing: [edited],
    cities: ['graz'],
    remote: new Set(['full/graz/b-2-22222222.webp']),
  });

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 0);
  assert.ok(
    lines.includes(
      'plan: 1 already present, 0 possible duplicates, 1 to insert',
    ),
  );
  assert.ok(lines.includes('insert: b-2 (graz)'));
  assert.ok(!lines.includes('insert: a-1 (graz)'));
  assert.ok(lines.includes('upload: 1 of 2 objects uploaded'));
  assert.deepEqual(uploadsOf(supabase.calls), ['thumb/graz/b-2-22222222.webp']);
  assert.deepEqual(
    callNames(supabase.calls).filter((name) => name.startsWith('list')),
    ['list full/graz', 'list thumb/graz'],
  );
  assert.deepEqual(
    insertBody(supabase.calls).payload.spots.map(({ id }) => id),
    ['b-2'],
  );
  assert.deepEqual(supabase.existing[0], edited);
});

test('a possible duplicate is printed and held back', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase({
    existing: [existingSpot('old-1', { lat: 47.07 + 10 / M_PER_DEGREE_LAT })],
    cities: ['graz'],
  });

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 0);
  assert.deepEqual(lines.slice(2, 5), [
    'plan: 0 already present, 1 possible duplicates, 1 to insert',
    'a-1 possible duplicate of old-1 (position, 10.0 m)',
    'insert: b-2 (graz)',
  ]);
  assert.deepEqual(uploadsOf(supabase.calls), [
    'full/graz/b-2-22222222.webp',
    'thumb/graz/b-2-22222222.webp',
  ]);
  assert.deepEqual(
    insertBody(supabase.calls).payload.spots.map(({ id }) => id),
    ['b-2'],
  );
});

test('--dry-run plans against the database and writes nothing', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase({
    existing: [existingSpot('a-1')],
    cities: ['graz'],
  });

  const { code, lines } = await sync(['--dry-run'], { ws, supabase });

  assert.equal(code, 0);
  assert.deepEqual(lines, [
    'target: 127.0.0.1:54321 (local stack), dry run',
    'load: 1 cities, 2 spots, 2 photos',
    'plan: 1 already present, 0 possible duplicates, 1 to insert',
    'insert: b-2 (graz)',
    'dry run: nothing written',
  ]);
  assert.deepEqual(callNames(supabase.calls), ['rpc sync_existing_spots']);
  assert.equal(existsSync(ws.thumbsDir), false);
  assert.equal(supabase.existing.length, 1);
});

test('--expect-no-inserts exits 1 when the plan would insert anything, and writes nothing', async (t) => {
  const ws = await workspace(t, { withPhotos: false });
  const supabase = fakeSupabase();

  const { code, lines } = await sync(['--db-only', '--expect-no-inserts'], {
    ws,
    supabase,
  });

  assert.equal(code, 1);
  assert.deepEqual(callNames(supabase.calls), ['rpc sync_existing_spots']);
  assert.ok(lines.includes('insert: a-1 (graz)'));
  assert.equal(
    lines.at(-1),
    'ERR sync:supabase: expected no inserts, but 2 spots would be inserted',
  );
  assert.equal(supabase.existing.length, 0);
});

test('--expect-no-inserts exits 0 when every spot is already present', async (t) => {
  const ws = await workspace(t, { withPhotos: false });
  const supabase = fakeSupabase({
    existing: [existingSpot('a-1'), existingSpot('b-2', { lng: 16.43 })],
    cities: ['graz'],
  });

  const { code, lines } = await sync(['--db-only', '--expect-no-inserts'], {
    ws,
    supabase,
  });

  assert.equal(code, 0);
  assert.deepEqual(callNames(supabase.calls), ['rpc sync_existing_spots']);
  assert.deepEqual(lines.slice(2), [
    'plan: 2 already present, 0 possible duplicates, 0 to insert',
    'expect no inserts: nothing to insert, nothing written',
  ]);
});

test('--db-only inserts from the datasets alone: no photos, thumbnails or uploads', async (t) => {
  const ws = await workspace(t, { withPhotos: false });
  const supabase = fakeSupabase();

  const { code, lines } = await sync(['--db-only'], { ws, supabase });

  assert.equal(code, 0);
  assert.deepEqual(callNames(supabase.calls), [
    'rpc sync_existing_spots',
    'rpc sync_insert_spots',
  ]);
  assert.equal(existsSync(ws.thumbsDir), false);
  assert.equal(lines.at(-1), 'database: 1 cities, 2 spots, 2 photos inserted');
});

test('a photo missing on disk fails the run before anything is written', async (t) => {
  const ws = await workspace(t, { withPhotos: false });
  const supabase = fakeSupabase();

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 1);
  assert.deepEqual(callNames(supabase.calls), ['rpc sync_existing_spots']);
  assert.equal(existsSync(ws.thumbsDir), false);
  assert.match(
    lines.at(-1),
    /2 referenced photos are not on disk, e\.g\. data\/spots\/graz\/a-1-11111111\.webp/,
  );
});

test('a failed database read stops the run before anything is written', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase({ failingRpc: 'sync_existing_spots' });

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 1);
  assert.deepEqual(callNames(supabase.calls), ['rpc sync_existing_spots']);
  assert.equal(existsSync(ws.thumbsDir), false);
  assert.equal(
    lines.at(-1),
    'ERR sync:supabase: rpc sync_existing_spots: HTTP 400 boom',
  );
});

test('a failed insert exits 1 and names it', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase({ failingRpc: 'sync_insert_spots' });

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 1);
  assert.equal(callNames(supabase.calls).at(-1), 'rpc sync_insert_spots');
  assert.equal(
    lines.at(-1),
    'ERR sync:supabase: rpc sync_insert_spots: HTTP 400 boom',
  );
  assert.equal(supabase.existing.length, 0);
});

test('after an upload fails nothing more is uploaded, nothing is inserted, and the run exits 1', async (t) => {
  const photos = Array.from(
    { length: 12 },
    (_, i) =>
      `graz/p${String(i).padStart(2, '0')}-1-${'0'.repeat(7)}${i % 10}.webp`,
  );
  const ws = await workspace(t, { photos });
  const supabase = fakeSupabase();
  const client = supabase.createClient();
  const started = [];
  const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const failing = {
    ...client,
    async upload(key, bytes) {
      started.push(key);
      const isThird = started.length === 3;
      await settle(isThird ? 5 : 15);
      if (isThird) throw new Error(`upload ${key}: HTTP 500 boom`);
      await client.upload(key, bytes);
    },
  };

  const lines = [];
  const code = await runSync([], {
    env: LOCAL,
    cities: ['graz'],
    spotsDir: ws.spotsDir,
    thumbsDir: ws.thumbsDir,
    createClient: () => failing,
    derive: fakeDerive,
    log: (line) => lines.push(line),
    error: (line) => lines.push(`ERR ${line}`),
  });
  const startedAtExit = started.length;
  await settle(60);

  assert.equal(code, 1);
  assert.match(lines.at(-1), /^ERR sync:supabase: upload .*: HTTP 500 boom$/);
  assert.equal(started.length, startedAtExit, 'nothing started after exit');
  assert.ok(
    startedAtExit <= 6,
    `only the first batch started: ${startedAtExit}`,
  );
  assert.ok(
    !callNames(supabase.calls).includes('rpc sync_insert_spots'),
    'nothing inserted',
  );
});
