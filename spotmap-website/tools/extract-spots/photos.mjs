/**
 * Downloads My Maps photos, fingerprints them and re-encodes them to WebP.
 *
 * Google rotates every photo URL on each KML export, so a photo is recognised by a fingerprint of
 * its tiny `fife=s32` rendition (~1–3 KB, byte-stable across exports) rather than by its URL.
 * Originals are full resolution (~2–7 MB), so each is fetched, encoded in memory and discarded.
 * One limiter caps requests in flight across the whole run. A link answered with a 4xx or a
 * non-image is dead — reported, never an error — while 429, 5xx, timeouts and network errors are
 * retried and only fail the city once retries run out.
 */
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { writeFileAtomic } from './atomic.mjs';

const MAX_REQUESTS_IN_FLIGHT = 4;
const REQUEST_TIMEOUT_MS = 60_000;
// One first attempt, then one retry after each delay.
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const FINGERPRINT_RENDITION = 'fife=s32';
const LONG_EDGE_PX = 1400;
const WEBP_QUALITY = 72;

/**
 * Creates a limiter that runs at most `maxInFlight` tasks at once and queues the rest in order.
 *
 * @param {number} maxInFlight
 * @returns {<T>(task: () => Promise<T>) => Promise<T>}
 */
export function createLimiter(maxInFlight) {
  let active = 0;
  const waiting = [];
  return async function limit(task) {
    if (active < maxInFlight) {
      active++;
    } else {
      // The finishing task hands its slot over directly, so `active` never overshoots.
      await new Promise((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
}

const limitRequests = createLimiter(MAX_REQUESTS_IN_FLIGHT);

/**
 * Downloads one photo (or rendition), classifying the answer.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {typeof globalThis.fetch} [options.fetch] injected for tests
 * @param {(ms: number) => Promise<unknown>} [options.sleep] injected for tests
 * @param {number} [options.timeoutMs] per-request timeout
 * @returns {Promise<{ ok: true, bytes: Buffer } | { dead: true, reason: string }>}
 * @throws {Error} naming the URL and the last reason once every retry has failed
 */
export async function fetchPhoto(
  url,
  {
    fetch = globalThis.fetch,
    sleep = delay,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {},
) {
  for (let attempt = 0; ; attempt++) {
    const outcome = await limitRequests(() =>
      attemptFetch(url, fetch, timeoutMs),
    );
    if (outcome.retryReason === undefined) {
      return outcome;
    }
    if (attempt === RETRY_DELAYS_MS.length) {
      throw new Error(
        `${url}: ${outcome.retryReason} after ${attempt + 1} attempts`,
      );
    }
    // Waiting happens outside the limiter, so a backing-off photo does not hold a slot.
    await sleep(outcome.retryAfterMs ?? RETRY_DELAYS_MS[attempt]);
  }
}

/**
 * Makes one request and classifies the answer; never throws. A 2xx image is `ok`. A 2xx
 * non-image or any 4xx other than 429 is `dead`. A 429, any other status (e.g. 5xx), a timeout or a
 * network error returns a `retryReason` instead; only a 429 also sets `retryAfterMs`, from its
 * `Retry-After` header, and leaves it `undefined` when that header is absent or unreadable.
 *
 * @param {string} url
 * @param {typeof globalThis.fetch} fetch
 * @param {number} timeoutMs aborts the request after this long
 * @returns {Promise<{ ok: true, bytes: Buffer } | { dead: true, reason: string } | { retryReason: string, retryAfterMs?: number }>}
 */
async function attemptFetch(url, fetch, timeoutMs) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const { status } = response;
    if (status >= 200 && status < 300) {
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        await response.body?.cancel();
        return {
          dead: true,
          reason: `content-type ${contentType || 'missing'}`,
        };
      }
      return { ok: true, bytes: Buffer.from(await response.arrayBuffer()) };
    }
    await response.body?.cancel();
    if (status === 429) {
      return {
        retryReason: 'http 429',
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      };
    }
    if (status >= 400 && status < 500) {
      return { dead: true, reason: `http ${status}` };
    }
    return { retryReason: `http ${status}` };
  } catch (error) {
    return {
      retryReason:
        error.name === 'TimeoutError'
          ? 'timeout'
          : `network error: ${error.message}`,
    };
  }
}

/**
 * Reads a `Retry-After` header as a wait in milliseconds. Accepts delay-seconds (`120`) or an
 * HTTP date (a date already past waits 0).
 *
 * @param {string | null} header the raw header value, `null` when absent
 * @returns {number | undefined} `undefined` when the header is absent or neither form, so the
 *   caller falls back to its own backoff
 */
function parseRetryAfter(header) {
  if (header === null) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/**
 * The URL of a photo's 32px rendition: its query replaced by `fife=s32`.
 *
 * @param {string} url the photo URL from `gx_media_links`
 * @returns {string}
 */
export function fingerprintUrl(url) {
  return `${url.split('?')[0]}?${FINGERPRINT_RENDITION}`;
}

/**
 * Fingerprints a photo from the bytes of its 32px rendition: the first 8 hex of their SHA-256.
 *
 * @param {Uint8Array} bytes the rendition fetched from {@link fingerprintUrl}
 * @returns {string}
 */
export function photoFingerprint(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

/**
 * Re-encodes a photo the way the Vienna pilot was encoded: EXIF orientation applied, long edge
 * capped at 1400 px (never enlarged), WebP quality 72, no metadata carried over (so any GPS EXIF
 * is dropped). Written atomically.
 *
 * @param {Uint8Array} bytes the original image
 * @param {string} outPath the `.webp` to write; its directory must exist
 * @returns {Promise<void>}
 */
export async function encodePhoto(bytes, outPath) {
  const webp = await sharp(bytes)
    .rotate()
    .resize({
      width: LONG_EDGE_PX,
      height: LONG_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  await writeFileAtomic(outPath, webp);
}
