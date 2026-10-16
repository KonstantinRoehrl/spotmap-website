/**
 * Tests for the sync's Supabase client: the requests it sends (endpoints, headers, bodies), list
 * pagination, batched deletes and failure messages. `fetch` is injected, so nothing here touches
 * the network.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  CACHE_CONTROL,
  DELETE_BATCH_SIZE,
  LIST_PAGE_SIZE,
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
