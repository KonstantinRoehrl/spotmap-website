/**
 * Tests for the snapshot export: which cities it writes, what it writes (the
 * city_spots() answer, as committed JSON, with the keys in the served order), the local-or-hosted target guard shared with the sync,
 * and the exit codes. The client is a fake that answers city_spots() from a table; snapshots go to
 * a temporary folder.
 */
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { toJsonText } from '../extract-spots/dataset.mjs';
import { parseSnapshotArgs, runSnapshot } from './snapshot.mjs';

const LOCAL = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};
const HOSTED = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};

/** A city_spots() answer with one spot. */
const answerOf = (city, id) => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.37, 48.2] },
      properties: {
        id,
        name: 'Ledge',
        status: 'active',
        notes: null,
        photos: [`${city}/${id}-0f0f0f0f.webp`],
      },
    },
  ],
});

/**
 * `answerOf`, as PostgreSQL's jsonb hands it back: the object keys of each feature's properties
 * ordered by length, then bytewise (id, name, notes, photos, status) — not the served order.
 */
const jsonbAnswerOf = (city, id) => {
  const answer = answerOf(city, id);
  for (const feature of answer.features) {
    const { id, name, notes, photos, status } = feature.properties;
    feature.properties = { id, name, notes, photos, status };
  }
  return answer;
};

/** A public folder holding a stale snapshot of each of `cities`. */
async function publicFolder(t, cities) {
  const dir = await mkdtemp(join(tmpdir(), 'snapshot-supabase-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const city of cities) {
    await writeFile(join(dir, `${city}.geojson`), 'stale');
  }
  return dir;
}

/** A fake `connect` whose client answers city_spots() from `answers` (city → value or Error). */
function fakeConnect(answers) {
  const calls = [];
  const connect = (credentials) => {
    calls.push(['connect', credentials.url]);
    return {
      async rpc(name, body) {
        calls.push(['rpc', name, body]);
        const answer = answers[body.p_city];
        if (answer instanceof Error) throw answer;
        return answer;
      },
    };
  };
  return { connect, calls };
}

/** Runs the export with captured output. */
async function snapshot(argv, { env = LOCAL, publicDir, connect }) {
  const lines = [];
  const code = await runSnapshot(argv, {
    env,
    connect,
    publicDir,
    log: (line) => lines.push(line),
    error: (line) => lines.push(`ERR ${line}`),
  });
  return { code, lines };
}

test('parseSnapshotArgs reads --hosted and repeatable --city, and rejects anything else', () => {
  assert.deepEqual(parseSnapshotArgs([]), { hosted: false, cities: [] });
  assert.deepEqual(
    parseSnapshotArgs(['--hosted', '--city', 'split', '--city', 'zadar']),
    {
      hosted: true,
      cities: ['split', 'zadar'],
    },
  );
  assert.throws(() => parseSnapshotArgs(['--force']), /--force/);
  assert.throws(() => parseSnapshotArgs(['vienna']));
  assert.throws(
    () => parseSnapshotArgs(['--city', 'Not A Slug']),
    /not a city slug: "Not A Slug"/,
  );
});

test('every existing snapshot is rewritten with exactly the city_spots() answer', async (t) => {
  const publicDir = await publicFolder(t, ['vienna', 'graz']);
  const fake = fakeConnect({
    vienna: answerOf('vienna', 'a-1'),
    graz: answerOf('graz', 'g-1'),
  });

  const { code, lines } = await snapshot([], {
    publicDir,
    connect: fake.connect,
  });

  assert.equal(code, 0);
  assert.equal(
    await readFile(join(publicDir, 'vienna.geojson'), 'utf8'),
    toJsonText(answerOf('vienna', 'a-1')),
  );
  assert.equal(
    await readFile(join(publicDir, 'graz.geojson'), 'utf8'),
    toJsonText(answerOf('graz', 'g-1')),
  );
  assert.deepEqual(
    fake.calls
      .filter(([kind]) => kind === 'rpc')
      .map(([, name, body]) => [name, body.p_city]),
    [
      ['city_spots', 'graz'],
      ['city_spots', 'vienna'],
    ],
  );
  assert.deepEqual(lines, [
    'target: 127.0.0.1:54321 (local stack)',
    'graz: 1 spots written',
    'vienna: 1 spots written',
  ]);
});

test('the snapshot is written in the served key order even when city_spots() answers jsonb-ordered keys', async (t) => {
  const publicDir = await publicFolder(t, ['vienna']);
  const fake = fakeConnect({ vienna: jsonbAnswerOf('vienna', 'a-1') });

  const { code } = await snapshot([], { publicDir, connect: fake.connect });

  assert.equal(code, 0);
  const written = JSON.parse(
    await readFile(join(publicDir, 'vienna.geojson'), 'utf8'),
  );
  assert.deepEqual(Object.keys(written.features[0].properties), [
    'id',
    'name',
    'status',
    'notes',
    'photos',
  ]);
  assert.equal(
    await readFile(join(publicDir, 'vienna.geojson'), 'utf8'),
    toJsonText(answerOf('vienna', 'a-1')),
  );
});

test('a feature that is not the served shape fails its city and keeps the previous snapshot', async (t) => {
  const publicDir = await publicFolder(t, ['graz', 'vienna']);
  const notAPoint = answerOf('vienna', 'a-1');
  notAPoint.features[0].geometry.type = 'LineString';
  const extraKey = answerOf('graz', 'g-1');
  extraKey.features[0].properties.sources = [];
  const fake = fakeConnect({ graz: extraKey, vienna: notAPoint });

  const { code, lines } = await snapshot([], {
    publicDir,
    connect: fake.connect,
  });

  assert.equal(code, 1);
  for (const city of ['graz', 'vienna']) {
    assert.equal(
      await readFile(join(publicDir, `${city}.geojson`), 'utf8'),
      'stale',
    );
  }
  assert.ok(
    lines.some((line) =>
      /^ERR graz: FAILED — city_spots\(graz\) answered a feature \(g-1\) that is not the served shape/.test(
        line,
      ),
    ),
    lines.join('\n'),
  );
  assert.ok(
    lines.some((line) =>
      /^ERR vienna: FAILED — city_spots\(vienna\) answered a feature \(a-1\) that is not the served shape/.test(
        line,
      ),
    ),
    lines.join('\n'),
  );
});

test('--city adds a city that has no snapshot yet', async (t) => {
  const publicDir = await publicFolder(t, ['vienna']);
  const fake = fakeConnect({
    vienna: answerOf('vienna', 'a-1'),
    split: answerOf('split', 's-1'),
  });

  const { code } = await snapshot(['--city', 'split', '--city', 'vienna'], {
    publicDir,
    connect: fake.connect,
  });

  assert.equal(code, 0);
  assert.deepEqual((await readdir(publicDir)).sort(), [
    'split.geojson',
    'vienna.geojson',
  ]);
});

test('a failed city is named, the others are still written, and the run exits 1', async (t) => {
  const publicDir = await publicFolder(t, ['graz', 'vienna']);
  const fake = fakeConnect({
    graz: new Error('rpc city_spots: HTTP 500 boom'),
    vienna: answerOf('vienna', 'a-1'),
  });

  const { code, lines } = await snapshot([], {
    publicDir,
    connect: fake.connect,
  });

  assert.equal(code, 1);
  assert.equal(
    await readFile(join(publicDir, 'graz.geojson'), 'utf8'),
    'stale',
  );
  assert.equal(
    await readFile(join(publicDir, 'vienna.geojson'), 'utf8'),
    toJsonText(answerOf('vienna', 'a-1')),
  );
  assert.ok(
    lines.includes('ERR graz: FAILED — rpc city_spots: HTTP 500 boom'),
    lines.join('\n'),
  );
  assert.equal(lines.at(-1), 'ERR snapshot:supabase: failed: graz');
});

test('an answer that is not a FeatureCollection fails its city and writes nothing', async (t) => {
  const publicDir = await publicFolder(t, ['vienna']);
  const fake = fakeConnect({ vienna: null });

  const { code, lines } = await snapshot([], {
    publicDir,
    connect: fake.connect,
  });

  assert.equal(code, 1);
  assert.equal(
    await readFile(join(publicDir, 'vienna.geojson'), 'utf8'),
    'stale',
  );
  assert.ok(
    lines.includes(
      'ERR vienna: FAILED — city_spots(vienna) did not answer a FeatureCollection',
    ),
    lines.join('\n'),
  );
});

test('a hosted project without --hosted, and --hosted against the local stack, are refused before connecting', async (t) => {
  const publicDir = await publicFolder(t, ['vienna']);
  for (const [argv, env, message] of [
    [[], HOSTED, /pass --hosted to read from it/],
    [
      ['--hosted'],
      LOCAL,
      /--hosted was given, but 127\.0\.0\.1:54321 is the local stack/,
    ],
  ]) {
    const fake = fakeConnect({});
    const { code, lines } = await snapshot(argv, {
      env,
      publicDir,
      connect: fake.connect,
    });
    assert.equal(code, 2);
    assert.deepEqual(fake.calls, []);
    assert.match(lines.join('\n'), message);
  }
});

test('a missing key, an unknown flag and an empty public folder without --city exit 2', async (t) => {
  const empty = await publicFolder(t, []);
  for (const [argv, env, message] of [
    [
      [],
      { SUPABASE_URL: LOCAL.SUPABASE_URL },
      /SUPABASE_SECRET_KEY is not set/,
    ],
    [['--force'], LOCAL, /--force/],
    [[], LOCAL, /no snapshot to export/],
  ]) {
    const fake = fakeConnect({});
    const { code, lines } = await snapshot(argv, {
      env,
      publicDir: empty,
      connect: fake.connect,
    });
    assert.equal(code, 2, lines.join('\n'));
    assert.deepEqual(fake.calls, []);
    assert.match(lines.join('\n'), message);
  }
});
