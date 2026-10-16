/**
 * A small fetch-based client for the two Supabase surfaces the sync needs: PostgREST RPC calls
 * and the spot-photos Storage bucket. No supabase-js: four calls don't earn a dependency.
 *
 * It authenticates with the project's secret key (`sb_secret_…`) in the `apikey` header only —
 * that key is not a JWT, so it never goes in `Authorization: Bearer`. The secret key bypasses
 * row-level security; it comes from the environment or spotmap-website/.env.local and is never
 * committed.
 */

/** The public bucket holding every photo, as `full/<city>/<file>.webp` and `thumb/<city>/<file>.webp`. */
export const BUCKET = 'spot-photos';
/** Storage's list endpoint is per folder and non-recursive, and pages at 100 entries by default. */
export const LIST_PAGE_SIZE = 100;
/** Keys per batched delete request. */
export const DELETE_BATCH_SIZE = 100;
/**
 * One week, without `immutable`: a file name fingerprints Google's 32 px rendition, not the
 * served bytes, so a re-encode rewrites a file under the same name.
 */
export const CACHE_CONTROL = 'max-age=604800';

/**
 * Reads the sync's target from the environment.
 *
 * @param {Record<string, string | undefined>} env usually `process.env`
 * @returns {{ url: string, secretKey: string }}
 * @throws {Error} naming the missing or wrong variable
 */
export function readCredentials(env) {
  const url = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!url) {
    throw new Error('SUPABASE_URL is not set (see .env.example)');
  }
  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is not set (see .env.example)');
  }
  if (!secretKey.startsWith('sb_secret_')) {
    throw new Error(
      'SUPABASE_SECRET_KEY must be a secret key (sb_secret_…), not a publishable key or a legacy JWT',
    );
  }
  if (!URL.canParse(url)) {
    throw new Error(`SUPABASE_URL is not a URL: ${url}`);
  }
  return { url, secretKey };
}

/**
 * One entry of a bucket folder listing.
 *
 * @typedef {object} StorageEntry
 * @property {string} name the entry's name inside the listed folder
 * @property {boolean} folder true for a sub-folder (Storage lists those with a null id)
 * @property {string | null} eTag the object's eTag without quotes — the MD5 of a single-part
 *   upload — or null for a folder
 */

/**
 * Creates the client.
 *
 * @param {{ url: string, secretKey: string, fetch?: typeof globalThis.fetch }} options `url` is
 *   the project URL, e.g. `http://127.0.0.1:54321`; `fetch` is injected for tests
 * @returns {{
 *   rpc: (name: string, body: object) => Promise<any>,
 *   listFolder: (folder: string) => Promise<StorageEntry[]>,
 *   upload: (key: string, bytes: Uint8Array) => Promise<void>,
 *   remove: (keys: string[]) => Promise<number>,
 * }}
 */
export function createSupabaseClient({
  url,
  secretKey,
  fetch = globalThis.fetch,
}) {
  const base = url.replace(/\/+$/, '');

  /** Sends one request and returns its response, or throws naming `what` on a non-2xx answer. */
  async function send(what, path, { headers = {}, ...init }) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { apikey: secretKey, ...headers },
    });
    if (!response.ok) {
      throw new Error(
        `${what}: HTTP ${response.status} ${await response.text()}`,
      );
    }
    return response;
  }

  /** A JSON request body with its content type. */
  const json = (body) => ({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  /** An object key as a URL path, each segment encoded. */
  const objectPath = (key) => key.split('/').map(encodeURIComponent).join('/');

  return {
    async rpc(name, body) {
      const response = await send(`rpc ${name}`, `/rest/v1/rpc/${name}`, {
        method: 'POST',
        ...json(body),
      });
      return response.json();
    },

    async listFolder(folder) {
      const entries = [];
      for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
        const response = await send(
          `list ${folder}`,
          `/storage/v1/object/list/${BUCKET}`,
          {
            method: 'POST',
            ...json({
              prefix: `${folder}/`,
              limit: LIST_PAGE_SIZE,
              offset,
              sortBy: { column: 'name', order: 'asc' },
            }),
          },
        );
        const page = await response.json();
        for (const { name, id, metadata } of page) {
          entries.push({
            name,
            folder: id === null,
            eTag: metadata?.eTag?.replaceAll('"', '') ?? null,
          });
        }
        if (page.length < LIST_PAGE_SIZE) {
          return entries;
        }
      }
    },

    async upload(key, bytes) {
      await send(
        `upload ${key}`,
        `/storage/v1/object/${BUCKET}/${objectPath(key)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'image/webp',
            'cache-control': CACHE_CONTROL,
            'x-upsert': 'true',
          },
          body: bytes,
        },
      );
    },

    async remove(keys) {
      for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
        await send('delete', `/storage/v1/object/${BUCKET}`, {
          method: 'DELETE',
          ...json({ prefixes: keys.slice(start, start + DELETE_BATCH_SIZE) }),
        });
      }
      return keys.length;
    },
  };
}
