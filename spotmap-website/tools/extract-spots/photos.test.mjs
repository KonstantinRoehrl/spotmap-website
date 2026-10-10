/**
 * Tests for photo download classification, retry, the request limiter, fingerprints and WebP
 * encoding. `fetch` and `sleep` are injected, so nothing here touches the network or waits on
 * the clock.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';
import {
  createLimiter,
  encodePhoto,
  fetchPhoto,
  fingerprintUrl,
  photoFingerprint,
} from './photos.mjs';

const URL_A =
  'https://mymaps.usercontent.google.com/hostedimage/m/*/AAA?fife=s16383';

const workDir = mkdtempSync(join(tmpdir(), 'extract-spots-photos-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

const image = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
const status =
  (code, headers = {}) =>
  () =>
    new Response(null, { status: code, headers });

/** A fake `fetch` that plays the given steps in order; a step returns a Response or throws. */
function scriptedFetch(...steps) {
  const calls = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      return steps.shift()();
    },
  };
}

function recordingSleep() {
  const delays = [];
  return { delays, sleep: async (ms) => delays.push(ms) };
}

test('a 2xx image is ok and carries its bytes', async () => {
  const { fetch, calls } = scriptedFetch(image);
  const outcome = await fetchPhoto(URL_A, {
    fetch,
    sleep: recordingSleep().sleep,
  });
  assert.deepEqual(outcome, { ok: true, bytes: Buffer.from([1, 2, 3]) });
  assert.deepEqual(calls, [URL_A]);
});

test('a 2xx that is not an image is dead', async () => {
  const html = () =>
    new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  const { fetch } = scriptedFetch(html);
  assert.deepEqual(
    await fetchPhoto(URL_A, { fetch, sleep: recordingSleep().sleep }),
    {
      dead: true,
      reason: 'content-type text/html; charset=utf-8',
    },
  );
});

test('404 and 403 are dead at once, without retrying', async () => {
  for (const code of [404, 403]) {
    const { fetch, calls } = scriptedFetch(status(code));
    const { delays, sleep } = recordingSleep();
    assert.deepEqual(await fetchPhoto(URL_A, { fetch, sleep }), {
      dead: true,
      reason: `http ${code}`,
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(delays, []);
  }
});

test('a 429 is retried after its Retry-After', async () => {
  const { fetch, calls } = scriptedFetch(
    status(429, { 'retry-after': '7' }),
    image,
  );
  const { delays, sleep } = recordingSleep();
  const outcome = await fetchPhoto(URL_A, { fetch, sleep });
  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [7000]);
});

test('a 5xx is retried with backoff, then throws naming the URL', async () => {
  const { fetch, calls } = scriptedFetch(
    status(503),
    status(503),
    status(503),
    status(503),
  );
  const { delays, sleep } = recordingSleep();
  await assert.rejects(
    fetchPhoto(URL_A, { fetch, sleep }),
    new RegExp(`${URL_A.replace(/[.*?]/g, '\\$&')}: http 503 after 4 attempts`),
  );
  assert.equal(calls.length, 4);
  assert.deepEqual(delays, [1000, 2000, 4000]);
});

test('a network error is retried', async () => {
  const failure = () => {
    throw new TypeError('fetch failed');
  };
  const { fetch } = scriptedFetch(failure, image);
  const { delays, sleep } = recordingSleep();
  assert.equal((await fetchPhoto(URL_A, { fetch, sleep })).ok, true);
  assert.deepEqual(delays, [1000]);
});

test('the limiter never runs more tasks at once than its limit', async () => {
  const limit = createLimiter(2);
  let active = 0;
  let peak = 0;
  const task = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
  };
  await Promise.all(Array.from({ length: 6 }, () => limit(task)));
  assert.equal(peak, 2);
});

test('the fingerprint URL swaps the query for the 32px rendition', () => {
  assert.equal(
    fingerprintUrl(URL_A),
    'https://mymaps.usercontent.google.com/hostedimage/m/*/AAA?fife=s32',
  );
  assert.equal(
    fingerprintUrl('https://lh3.googleusercontent.com/umsh/CCC'),
    'https://lh3.googleusercontent.com/umsh/CCC?fife=s32',
  );
});

test('the fingerprint is the first 8 hex of SHA-256 over the bytes', () => {
  const bytes = Buffer.from([1, 2, 3]);
  assert.equal(
    photoFingerprint(bytes),
    createHash('sha256').update(bytes).digest('hex').slice(0, 8),
  );
});

test('encoding applies EXIF orientation and caps the long edge at 1400', async () => {
  const source = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: '#336699' },
  })
    .png()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const outPath = join(workDir, 'rotated.webp');
  await encodePhoto(source, outPath);
  const { format, width, height } = await sharp(outPath).metadata();
  assert.deepEqual(
    { format, width, height },
    { format: 'webp', width: 700, height: 1400 },
  );
  assert.deepEqual(
    readdirSync(workDir).filter((name) => name.endsWith('.tmp')),
    [],
  );
});

test('encoding never enlarges a small image', async () => {
  const source = await sharp({
    create: { width: 300, height: 200, channels: 3, background: '#000000' },
  })
    .png()
    .toBuffer();
  const outPath = join(workDir, 'small.webp');
  await encodePhoto(source, outPath);
  assert.equal((await sharp(outPath).metadata()).width, 300);
});
