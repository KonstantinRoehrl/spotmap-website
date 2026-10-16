/**
 * Tests for the sync command: the target guard, the order of its steps (prune only after the
 * database sync succeeded), --db-only, --dry-run, and the all-zero re-run. The Supabase client
 * is a fake that records every call; datasets, photos and thumbnails live in temporary folders.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
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
const ZERO = {
  spots: { inserted: 0, updated: 0, deleted: 0 },
  photos: { inserted: 0, deleted: 0 },
};
const PHOTOS = ['graz/a-1-11111111.webp', 'graz/b-2-22222222.webp'];

const md5 = (text) => createHash('md5').update(text).digest('hex');

/** A data/spots folder with one city, graz, whose two spots link the two PHOTOS, on disk. */
async function workspace(t, { withPhotos = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sync-supabase-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const spotsDir = join(root, 'spots');
  const thumbsDir = join(root, 'thumbs');
  await mkdir(join(spotsDir, 'graz'), { recursive: true });
  const features = PHOTOS.map((key, i) => ({
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
    for (const key of PHOTOS) {
      await writeFile(join(spotsDir, key), `full ${key}`);
    }
  }
  return { spotsDir, thumbsDir };
}

/** A thumbnail deriver that writes a recognisable stand-in instead of running sharp. */
const fakeDerive = async (source, out) => {
  await writeFile(out, `thumb of ${source.split('/').slice(-2).join('/')}`);
};

/**
 * A fake client over a fake bucket. `remote` maps bucket keys to eTags; uploads and removes
 * update it, so a second run sees the first run's result.
 */
function fakeSupabase({ remote = new Map(), rpcError } = {}) {
  const calls = [];
  const client = {
    async rpc(name, body) {
      calls.push(['rpc', name, body]);
      if (rpcError) throw rpcError;
      return name === 'sync_spots' ? ZERO : body;
    },
    async listFolder(folder) {
      calls.push(['list', folder]);
      const depth = folder.split('/').length;
      const entries = new Map();
      for (const [key, eTag] of remote) {
        if (!key.startsWith(`${folder}/`)) continue;
        const parts = key.split('/');
        const name = parts[depth];
        entries.set(
          name,
          parts.length > depth + 1
            ? { name, folder: true, eTag: null }
            : { name, folder: false, eTag },
        );
      }
      return [...entries.values()];
    },
    async upload(key, bytes) {
      calls.push(['upload', key]);
      remote.set(key, createHash('md5').update(bytes).digest('hex'));
    },
    async remove(keys) {
      calls.push(['remove', keys]);
      for (const key of keys) remote.delete(key);
      return keys.length;
    },
  };
  return { calls, remote, createClient: () => client };
}

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

test('parseSyncArgs reads the three flags and rejects anything else', () => {
  assert.deepEqual(parseSyncArgs([]), {
    dryRun: false,
    dbOnly: false,
    hosted: false,
  });
  assert.deepEqual(parseSyncArgs(['--dry-run', '--db-only', '--hosted']), {
    dryRun: true,
    dbOnly: true,
    hosted: true,
  });
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

test('a first run derives, uploads, mirrors the database, then prunes', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase({
    remote: new Map([['full/linz/old.webp', 'x']]),
  });

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 0);
  assert.equal(lines[0], 'target: 127.0.0.1:54321 (local stack)');
  for (const key of PHOTOS) {
    assert.ok(existsSync(join(ws.thumbsDir, key)), `thumbnail ${key}`);
  }
  const kinds = supabase.calls.map(([kind]) => kind);
  const lastUpload = kinds.lastIndexOf('upload');
  const rpc = kinds.indexOf('rpc');
  const remove = kinds.indexOf('remove');
  assert.ok(lastUpload < rpc && rpc < remove, `order: ${kinds.join(',')}`);
  assert.deepEqual(
    supabase.calls
      .filter(([kind]) => kind === 'upload')
      .map(([, key]) => key)
      .sort(),
    [
      'full/graz/a-1-11111111.webp',
      'full/graz/b-2-22222222.webp',
      'thumb/graz/a-1-11111111.webp',
      'thumb/graz/b-2-22222222.webp',
    ],
  );
  const [, name, body] = supabase.calls[rpc];
  assert.equal(name, 'sync_spots');
  assert.deepEqual(body.payload.cities, ['graz']);
  assert.deepEqual(
    body.payload.spots.map(({ photos }) => photos),
    PHOTOS.map((key) => [key]),
  );
  assert.deepEqual(supabase.calls[remove][1], ['full/linz/old.webp']);
  assert.ok(lines.includes('upload: 4 of 4 objects uploaded'));
  assert.ok(lines.includes('prune: 1 objects deleted'));
});

test('a re-run with unchanged data reports zero for every step', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase();
  await sync([], { ws, supabase });
  supabase.calls.length = 0;

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 0);
  assert.equal(supabase.calls.filter(([kind]) => kind === 'upload').length, 0);
  assert.deepEqual(lines.slice(1), [
    'load: 1 cities, 2 spots, 2 photos',
    'thumbnails: 0 derived, 0 deleted',
    'upload: 0 of 4 objects uploaded',
    'database: spots 0 inserted, 0 updated, 0 deleted; photos 0 inserted, 0 deleted',
    'prune: 0 objects deleted',
  ]);
});

test('a changed local file uploads exactly that object', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase();
  await sync([], { ws, supabase });
  supabase.calls.length = 0;
  await writeFile(join(ws.spotsDir, PHOTOS[0]), 're-encoded');
  // Refresh the thumbnail by hand (same bytes), so only the full-size object differs.
  await fakeDerive(join(ws.spotsDir, PHOTOS[0]), join(ws.thumbsDir, PHOTOS[0]));

  await sync([], { ws, supabase });

  assert.deepEqual(
    supabase.calls.filter(([kind]) => kind === 'upload').map(([, key]) => key),
    [`full/${PHOTOS[0]}`],
  );
  assert.equal(supabase.remote.get(`full/${PHOTOS[0]}`), md5('re-encoded'));
});

test('a failed database sync exits 1 and deletes nothing', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase({
    remote: new Map([['full/linz/old.webp', 'x']]),
    rpcError: new Error('rpc sync_spots: HTTP 400 duplicate spot id'),
  });

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 1);
  assert.equal(
    supabase.calls.some(([kind]) => kind === 'remove'),
    false,
  );
  assert.ok(supabase.remote.has('full/linz/old.webp'));
  assert.match(lines.at(-1), /^ERR sync:supabase: rpc sync_spots: HTTP 400/);
});

test('--db-only seeds the database from the datasets alone', async (t) => {
  const ws = await workspace(t, { withPhotos: false });
  const supabase = fakeSupabase();

  const { code } = await sync(['--db-only'], { ws, supabase });

  assert.equal(code, 0);
  assert.deepEqual(
    supabase.calls.map(([kind, name]) => [kind, name]),
    [['rpc', 'sync_spots']],
  );
  assert.equal(existsSync(ws.thumbsDir), false);
});

test('--dry-run plans every step and writes nothing', async (t) => {
  const ws = await workspace(t);
  const supabase = fakeSupabase({
    remote: new Map([['thumb/linz/old.webp', 'x']]),
  });

  const { code, lines } = await sync(['--dry-run'], { ws, supabase });

  assert.equal(code, 0);
  assert.equal(existsSync(ws.thumbsDir), false);
  assert.deepEqual(
    [...new Set(supabase.calls.map(([kind]) => kind))],
    ['list'],
  );
  assert.deepEqual(lines.slice(1), [
    'load: 1 cities, 2 spots, 2 photos',
    'thumbnails: 2 to derive, 0 to delete',
    'upload: 4 of 4 objects to upload',
    'database: skipped (dry run), 2 spots to mirror',
    'prune: 1 objects to delete',
  ]);
});

test('a referenced photo missing on disk fails before any network call', async (t) => {
  const ws = await workspace(t, { withPhotos: false });
  const supabase = fakeSupabase();

  const { code, lines } = await sync([], { ws, supabase });

  assert.equal(code, 1);
  assert.deepEqual(supabase.calls, []);
  assert.match(
    lines.at(-1),
    /2 referenced photos are not on disk, e\.g\. data\/spots\/graz\/a-1-11111111\.webp/,
  );
});
