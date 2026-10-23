/**
 * A small fetch-based client for the two Supabase surfaces the sync and the snapshot export need:
 * PostgREST RPC calls and the spot-photos Storage bucket. No supabase-js: three calls don't earn a
 * dependency.
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
/**
 * One week, without `immutable`: a file name fingerprints Google's 32 px rendition, not the
 * served bytes, so a re-encode rewrites a file under the same name.
 */
export const CACHE_CONTROL = 'max-age=604800';
/**
 * Per-request timeout. A full-size photo is a few hundred KB, so 30 s is far beyond a healthy
 * request on any connection the sync is run from, yet short enough that a stalled connection
 * costs half a minute instead of hanging the run for good.
 */
export const REQUEST_TIMEOUT_MS = 30_000;
/**
 * Attempts per idempotent call (list, upload) before giving up: enough to ride out a
 * transient 5xx or reset during the first hosted upload of thousands of objects, few enough that
 * a real outage still fails the run within about a minute.
 */
export const MAX_ATTEMPTS = 3;
/** The wait before the second attempt; each further wait doubles (0.5 s, 1 s). */
export const RETRY_BACKOFF_MS = 500;

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
 */

/**
 * Whether a failed answer is worth another attempt: a server error or a rate limit. Any other 4xx
 * is the request's own fault and would fail the same way again.
 *
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return status >= 500 || status === 429;
}

/**
 * Creates the client. Every request has a timeout; list and upload are idempotent and are retried
 * with backoff on a network error, a timeout, a 5xx or a 429 — the upload upserts, so a retry
 * after an attempt that did store its object still succeeds. `rpc` is sent once: a retried
 * `sync_insert_spots` whose first attempt had committed would fail with "spot <id> already exists"
 * and hide that the insert succeeded.
 *
 * @param {{ url: string, secretKey: string, fetch?: typeof globalThis.fetch, timeoutMs?: number,
 *   sleep?: (ms: number) => Promise<unknown> }} options `url` is the project URL, e.g.
 *   `http://127.0.0.1:54321`; `fetch`, `timeoutMs` (default {@link REQUEST_TIMEOUT_MS}) and
 *   `sleep` (the retry delay) are injected for tests
 * @returns {{
 *   rpc: (name: string, body: object) => Promise<any>,
 *   listFolder: (folder: string) => Promise<StorageEntry[]>,
 *   upload: (key: string, bytes: Uint8Array) => Promise<void>,
 * }}
 */
export function createSupabaseClient({
  url,
  secretKey,
  fetch = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const base = url.replace(/\/+$/, '');

  /**
   * Sends a request and returns its response body text, or throws naming `what` and the status
   * (or the timeout / network error) once the request has failed for good. A retryable request
   * is attempted up to {@link MAX_ATTEMPTS} times, waiting {@link RETRY_BACKOFF_MS} and then
   * twice that between attempts; the final error says how many attempts were made.
   */
  async function send(what, path, { headers = {}, ...init }, { retry }) {
    const attempts = retry ? MAX_ATTEMPTS : 1;
    for (let attempt = 1; ; attempt++) {
      let failure;
      try {
        // The timeout covers reading the body too: a connection can stall after the headers.
        const response = await fetch(`${base}${path}`, {
          ...init,
          headers: { apikey: secretKey, ...headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.text();
        if (response.ok) {
          return body;
        }
        failure = {
          message: `HTTP ${response.status} ${body}`,
          retryable: isRetryableStatus(response.status),
        };
      } catch (problem) {
        failure = {
          message:
            problem?.name === 'TimeoutError'
              ? `timed out after ${timeoutMs} ms`
              : `request failed: ${problem?.message}`,
          retryable: true,
          cause: problem,
        };
      }
      if (!failure.retryable || attempt === attempts) {
        throw new Error(
          `${what}: ${failure.message}` +
            (attempt > 1 ? ` (after ${attempt} attempts)` : ''),
          { cause: failure.cause },
        );
      }
      await sleep(RETRY_BACKOFF_MS * 2 ** (attempt - 1));
    }
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
      const answer = await send(
        `rpc ${name}`,
        `/rest/v1/rpc/${name}`,
        { method: 'POST', ...json(body) },
        { retry: false },
      );
      return JSON.parse(answer);
    },

    async listFolder(folder) {
      const entries = [];
      for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
        const answer = await send(
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
          { retry: true },
        );
        const page = JSON.parse(answer);
        for (const { name, id } of page) {
          entries.push({ name, folder: id === null });
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
        { retry: true },
      );
    },
  };
}
