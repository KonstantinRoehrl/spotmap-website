/**
 * Tests for the parity check: the first difference between the live city_spots() answer and the
 * bundled snapshot, and the command's exit codes. The client is a fake.
 */
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { firstDifference, runParity } from './parity.mjs';

const ENV = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};
const COLLECTION = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.37, 48.2] },
      properties: {
        id: 'a-1',
        name: 'A',
        status: 'active',
        notes: null,
        photos: [],
      },
    },
  ],
};

test('firstDifference is null for equal values, whatever the key order', () => {
  assert.equal(
    firstDifference(
      { b: 1, a: [1, { c: null }] },
      { a: [1, { c: null }], b: 1 },
    ),
    null,
  );
});

test('firstDifference names the path of the first differing value', () => {
  const live = structuredClone(COLLECTION);
  live.features[0].properties.notes = 'big';
  assert.equal(
    firstDifference(live, COLLECTION),
    '$.features[0].properties.notes: "big" ≠ null',
  );
});

test('firstDifference names a missing key and a length difference', () => {
  assert.equal(
    firstDifference({ a: 1 }, { a: 1, b: 2 }),
    '$.b: missing in the live answer',
  );
  assert.equal(
    firstDifference({ a: 1, b: 2 }, { a: 1 }),
    '$.b: missing in the snapshot',
  );
  assert.equal(firstDifference([1, 2], [1]), '$: 2 items ≠ 1 items');
});

/** Runs the parity check against snapshots in a temporary folder. */
async function parity(t, { live, argv = [], env = ENV, onCreateClient }) {
  const publicDir = await mkdtemp(join(tmpdir(), 'sync-supabase-parity-'));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  await writeFile(
    join(publicDir, 'vienna.geojson'),
    JSON.stringify(COLLECTION),
  );
  const lines = [];
  const code = await runParity(argv, {
    env,
    cities: ['vienna'],
    publicDir,
    createClient: (options) => {
      onCreateClient?.(options);
      return {
        async rpc(name, body) {
          assert.equal(name, 'city_spots');
          assert.deepEqual(body, { p_city: 'vienna' });
          if (live instanceof Error) throw live;
          return live;
        },
      };
    },
    log: (line) => lines.push(line),
    error: (line) => lines.push(`ERR ${line}`),
  });
  return { code, lines };
}

test('runParity exits 0 when every city matches its snapshot', async (t) => {
  const { code, lines } = await parity(t, {
    live: structuredClone(COLLECTION),
  });
  assert.equal(code, 0);
  assert.ok(lines.includes('vienna: matches the snapshot (1 spots)'));
});

test('runParity exits 1 naming the city and the first difference', async (t) => {
  const live = structuredClone(COLLECTION);
  live.features[0].geometry.coordinates[0] = 16.3700001;
  const { code, lines } = await parity(t, { live });
  assert.equal(code, 1);
  assert.match(
    lines.at(-1),
    /^ERR vienna: \$\.features\[0\]\.geometry\.coordinates\[0\]: 16\.3700001 ≠ 16\.37$/,
  );
});

test('runParity exits 1 when the live query fails', async (t) => {
  const { code, lines } = await parity(t, {
    live: new Error('rpc city_spots: HTTP 400 unknown city: vienna'),
  });
  assert.equal(code, 1);
  assert.match(lines.at(-1), /^ERR vienna: rpc city_spots: HTTP 400/);
});

test('runParity exits 2 on an argument or a missing key', async (t) => {
  assert.equal(
    (await parity(t, { live: COLLECTION, argv: ['--hosted'] })).code,
    2,
  );
  assert.equal(
    (
      await parity(t, {
        live: COLLECTION,
        env: { SUPABASE_URL: ENV.SUPABASE_URL },
      })
    ).code,
    2,
  );
});

const PUBLISHABLE = 'sb_publishable_test';

test('runParity reads as the public when a publishable key is set', async (t) => {
  let options;
  const { code } = await parity(t, {
    live: structuredClone(COLLECTION),
    env: { ...ENV, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE },
    onCreateClient: (given) => (options = given),
  });
  assert.equal(code, 0);
  assert.equal(options.publishableKey, PUBLISHABLE);
});

test('runParity reads with the secret key when no publishable key is set', async (t) => {
  let options;
  const { code } = await parity(t, {
    live: structuredClone(COLLECTION),
    onCreateClient: (given) => (options = given),
  });
  assert.equal(code, 0);
  assert.equal(options.secretKey, ENV.SUPABASE_SECRET_KEY);
  assert.equal(options.publishableKey, undefined);
});

test('runParity refuses a publishable key that is not one', async (t) => {
  for (const wrong of [ENV.SUPABASE_SECRET_KEY, 'eyJhbGciOi.legacy.jwt']) {
    const { code, lines } = await parity(t, {
      live: COLLECTION,
      env: { ...ENV, SUPABASE_PUBLISHABLE_KEY: wrong },
    });
    assert.equal(code, 2);
    assert.match(
      lines.at(-1),
      /SUPABASE_PUBLISHABLE_KEY must be a publishable key \(sb_publishable_…\)/,
    );
    assert.ok(!lines.join('\n').includes(wrong), 'the value is not echoed');
  }
});
