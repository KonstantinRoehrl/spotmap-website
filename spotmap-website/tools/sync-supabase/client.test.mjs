/**
 * Tests for the sync's Supabase client: the requests it sends (endpoints, headers, bodies), list
 * pagination, batched deletes, failure messages, and the per-request timeout and bounded retry.
 * `fetch` and the retry delay are injected, so nothing here touches the network or waits.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  CACHE_CONTROL,
  DELETE_BATCH_SIZE,
  LIST_PAGE_SIZE,
  MAX_ATTEMPTS,
  createSupabaseClient,
  readCredentials,
} from './client.mjs';

const URL_ = 'http://127.0.0.1:54321';
const SECRET = 'sb_secret_test';

/** A fake fetch that records every request and answers from `answer(request, index)`. */
function recordingFetch(answer = () => Response.json({})) {
  const requests = [];
  const fetch = async (input, init = {}) => {
    const request = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body,
    };
    requests.push(request);
    return answer(request, requests.length - 1);
  };
  return { fetch, requests };
}

test('readCredentials returns the URL and secret key from the environment', () => {
  assert.deepEqual(
    readCredentials({ SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: SECRET }),
    { url: URL_, secretKey: SECRET },
  );
});

test('readCredentials refuses a missing value, a non-secret key and a bad URL', () => {
  assert.throws(
    () => readCredentials({ SUPABASE_URL: URL_ }),
    /SUPABASE_SECRET_KEY/,
  );
  assert.throws(
    () => readCredentials({ SUPABASE_SECRET_KEY: SECRET }),
    /SUPABASE_URL/,
  );
  assert.throws(
    () =>
      readCredentials({
        SUPABASE_URL: URL_,
        SUPABASE_SECRET_KEY: 'sb_publishable_abc',
      }),
    /sb_secret_/,
  );
  assert.throws(
    () =>
      readCredentials({
        SUPABASE_URL: 'not a url',
        SUPABASE_SECRET_KEY: SECRET,
      }),
    /not a URL/,
  );
});

test('rpc posts JSON to the REST endpoint with the secret key as apikey only', async () => {
  const { fetch, requests } = recordingFetch(() => Response.json({ ok: 1 }));
  const client = createSupabaseClient({
    url: `${URL_}/`,
    secretKey: SECRET,
    fetch,
  });

  assert.deepEqual(await client.rpc('sync_spots', { payload: { a: 1 } }), {
    ok: 1,
  });

  const [request] = requests;
  assert.equal(request.url, `${URL_}/rest/v1/rpc/sync_spots`);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('apikey'), SECRET);
  assert.equal(request.headers.get('authorization'), null);
  assert.equal(request.headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(request.body), { payload: { a: 1 } });
});

test('a failed request throws with the status and body', async () => {
  const { fetch } = recordingFetch(
    () => new Response('{"message":"boom"}', { status: 400 }),
  );
  const client = createSupabaseClient({ url: URL_, secretKey: SECRET, fetch });

  await assert.rejects(
    client.rpc('sync_spots', {}),
    /rpc sync_spots: HTTP 400 \{"message":"boom"\}/,
  );
});

test('listFolder pages through a folder and marks sub-folders', async () => {
  const page = (count, offset) =>
    Array.from({ length: count }, (_, i) => ({
      name: `f${offset + i}.webp`,
      id: `id-${offset + i}`,
      metadata: { eTag: `"etag${offset + i}"` },
    }));
  const { fetch, requests } = recordingFetch((request, index) => {
    if (index === 0) return Response.json(page(LIST_PAGE_SIZE, 0));
    return Response.json([
      ...page(1, LIST_PAGE_SIZE),
      { name: 'sub', id: null, metadata: null },
    ]);
  });
  const client = createSupabaseClient({ url: URL_, secretKey: SECRET, fetch });

  const entries = await client.listFolder('thumb/vienna');

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, `${URL_}/storage/v1/object/list/spot-photos`);
  assert.deepEqual(JSON.parse(requests[0].body), {
    prefix: 'thumb/vienna/',
    limit: LIST_PAGE_SIZE,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  });
  assert.equal(JSON.parse(requests[1].body).offset, LIST_PAGE_SIZE);
  assert.equal(entries.length, LIST_PAGE_SIZE + 2);
  assert.deepEqual(entries[0], {
    name: 'f0.webp',
    folder: false,
    eTag: 'etag0',
  });
  assert.deepEqual(entries.at(-1), { name: 'sub', folder: true, eTag: null });
});

test('upload upserts one WebP with the one-week cache header', async () => {
  const { fetch, requests } = recordingFetch();
  const client = createSupabaseClient({ url: URL_, secretKey: SECRET, fetch });
  const bytes = new Uint8Array([1, 2, 3]);

  await client.upload('thumb/vienna/hbf-curb-99f6e5-9f98eefd.webp', bytes);

  const [request] = requests;
  assert.equal(
    request.url,
    `${URL_}/storage/v1/object/spot-photos/thumb/vienna/hbf-curb-99f6e5-9f98eefd.webp`,
  );
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('content-type'), 'image/webp');
  assert.equal(request.headers.get('cache-control'), CACHE_CONTROL);
  assert.equal(request.headers.get('x-upsert'), 'true');
  assert.equal(request.headers.get('apikey'), SECRET);
  assert.equal(request.body, bytes);
});

test('remove deletes in batches and reports how many keys it removed', async () => {
  const { fetch, requests } = recordingFetch(() => Response.json([]));
  const client = createSupabaseClient({ url: URL_, secretKey: SECRET, fetch });
  const keys = Array.from(
    { length: DELETE_BATCH_SIZE + 1 },
    (_, i) => `full/x/${i}.webp`,
  );

  assert.equal(await client.remove(keys), keys.length);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, 'DELETE');
  assert.equal(requests[0].url, `${URL_}/storage/v1/object/spot-photos`);
  assert.equal(JSON.parse(requests[0].body).prefixes.length, DELETE_BATCH_SIZE);
  assert.deepEqual(JSON.parse(requests[1].body), {
    prefixes: [`full/x/${DELETE_BATCH_SIZE}.webp`],
  });
});

test('remove sends nothing for no keys', async () => {
  const { fetch, requests } = recordingFetch();
  const client = createSupabaseClient({ url: URL_, secretKey: SECRET, fetch });

  assert.equal(await client.remove([]), 0);
  assert.equal(requests.length, 0);
});

/** A fake `sleep` that records the delays it was asked for instead of waiting. */
function recordingSleep() {
  const delays = [];
  return { sleep: async (ms) => delays.push(ms), delays };
}

/** A fake fetch that never answers on its own and rejects once the request's signal aborts. */
function hangingFetch() {
  let calls = 0;
  const fetch = (_input, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal.reason));
    });
  };
  return { fetch, calls: () => calls };
}

/**
 * Fails the test instead of hanging when `promise` has not settled after `ms`: without a request
 * timeout a hanging fetch never settles, and a hung test run would report nothing.
 */
function settlesWithin(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error(`still pending after ${ms} ms`)), ms),
    ),
  ]);
}

test('a transient 503 on an upload is retried and then succeeds', async () => {
  const { fetch, requests } = recordingFetch((_request, index) =>
    index === 0 ? new Response('busy', { status: 503 }) : Response.json({}),
  );
  const { sleep, delays } = recordingSleep();
  const client = createSupabaseClient({
    url: URL_,
    secretKey: SECRET,
    fetch,
    sleep,
  });

  await client.upload('full/x/a.webp', new Uint8Array([1]));

  assert.equal(requests.length, 2);
  assert.equal(delays.length, 1);
});

test('a persistent 503 gives up after the attempt cap and says so', async () => {
  const { fetch, requests } = recordingFetch(
    () => new Response('busy', { status: 503 }),
  );
  const { sleep, delays } = recordingSleep();
  const client = createSupabaseClient({
    url: URL_,
    secretKey: SECRET,
    fetch,
    sleep,
  });

  await assert.rejects(
    client.listFolder('full/x'),
    new RegExp(
      `list full/x: HTTP 503 busy \\(after ${MAX_ATTEMPTS} attempts\\)`,
    ),
  );

  assert.equal(requests.length, MAX_ATTEMPTS);
  assert.equal(delays.length, MAX_ATTEMPTS - 1);
  assert.ok(delays[1] > delays[0], `backoff grows: ${delays}`);
});

test('429 and a dropped connection are retried too', async () => {
  const { fetch, requests } = recordingFetch((_request, index) => {
    if (index === 0) return new Response('slow down', { status: 429 });
    if (index === 1) throw new TypeError('fetch failed');
    return Response.json([]);
  });
  const client = createSupabaseClient({
    url: URL_,
    secretKey: SECRET,
    fetch,
    sleep: recordingSleep().sleep,
  });

  assert.equal(await client.remove(['full/x/a.webp']), 1);

  assert.equal(requests.length, 3);
});

test('a 400 is not retried', async () => {
  const { fetch, requests } = recordingFetch(
    () => new Response('bad key', { status: 400 }),
  );
  const { sleep, delays } = recordingSleep();
  const client = createSupabaseClient({
    url: URL_,
    secretKey: SECRET,
    fetch,
    sleep,
  });

  await assert.rejects(
    client.upload('full/x/a.webp', new Uint8Array([1])),
    (problem) =>
      /upload full\/x\/a\.webp: HTTP 400 bad key$/.test(problem.message),
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(delays, []);
});

test('a hanging request is aborted by the timeout and retried', async () => {
  const { fetch, calls } = hangingFetch();
  const client = createSupabaseClient({
    url: URL_,
    secretKey: SECRET,
    fetch,
    sleep: recordingSleep().sleep,
    timeoutMs: 20,
  });

  await assert.rejects(
    settlesWithin(1000, client.upload('full/x/a.webp', new Uint8Array([1]))),
    new RegExp(
      `upload full/x/a\\.webp: timed out after 20 ms \\(after ${MAX_ATTEMPTS} attempts\\)`,
    ),
  );

  assert.equal(calls(), MAX_ATTEMPTS);
});

test('rpc is sent once on a 503, because its first attempt may have committed', async () => {
  const { fetch, requests } = recordingFetch(
    () => new Response('busy', { status: 503 }),
  );
  const { sleep, delays } = recordingSleep();
  const client = createSupabaseClient({
    url: URL_,
    secretKey: SECRET,
    fetch,
    sleep,
  });

  await assert.rejects(client.rpc('sync_spots', {}), (problem) =>
    /^rpc sync_spots: HTTP 503 busy$/.test(problem.message),
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(delays, []);
});

test('rpc still has the timeout', async () => {
  const { fetch, calls } = hangingFetch();
  const client = createSupabaseClient({
    url: URL_,
    secretKey: SECRET,
    fetch,
    timeoutMs: 20,
  });

  await assert.rejects(
    settlesWithin(1000, client.rpc('sync_spots', {})),
    /rpc sync_spots: timed out after 20 ms$/,
  );

  assert.equal(calls(), 1);
});

test('a publishable key replaces the secret key in apikey, and nothing goes in Authorization', async () => {
  const { fetch, requests } = recordingFetch(() => Response.json([]));
  const client = createSupabaseClient({
    url: URL_,
    secretKey: SECRET,
    publishableKey: 'sb_publishable_test',
    fetch,
  });

  await client.rpc('city_spots', { p_city: 'vienna' });

  const [request] = requests;
  assert.equal(request.headers.get('apikey'), 'sb_publishable_test');
  assert.equal(request.headers.get('authorization'), null);
  assert.ok(!JSON.stringify([...request.headers]).includes(SECRET));
});
