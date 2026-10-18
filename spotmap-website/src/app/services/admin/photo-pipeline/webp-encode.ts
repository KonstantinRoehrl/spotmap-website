import { InjectionToken } from '@angular/core';

/**
 * Encodes decoded pixels as WebP.
 *
 * @param image the pixels to encode, already at the rendition's size
 * @param quality the libwebp quality factor, 0–100
 * @returns a Blob of type `image/webp`
 */
export type WebpEncoder = (image: ImageData, quality: number) => Promise<Blob>;

/**
 * Draws pixels onto a canvas and asks the browser for a WebP. Resolves whatever the browser
 * produced: Safari ignores an unsupported `image/webp` request and hands back a PNG, which
 * {@link createWebpEncoder} detects by the Blob's type (and a rejection, which it treats alike).
 */
export type CanvasEncoder = (
  image: ImageData,
  quality: number,
) => Promise<Blob>;

/** The MIME type every encoder in this file produces. */
export const WEBP_MIME_TYPE = 'image/webp';

/**
 * Where jSquash's encoder `.wasm` files are served, relative to the document base URL.
 * angular.json copies `node_modules/@jsquash/webp/codec/enc/*.wasm` into this directory for both
 * the build and the test target; the emscripten glue's own `new URL(…, import.meta.url)` lookup
 * would point inside the bundler's chunk directory, where no `.wasm` exists.
 */
export const JSQUASH_WASM_DIR = 'jsquash/';

/**
 * Encodes on a canvas: an `OffscreenCanvas` where the browser has one, a detached `<canvas>`
 * otherwise. Rejects when the browser gives no 2D context or no image (e.g. a canvas over its
 * size limit).
 */
export async function encodeOnCanvas(
  image: ImageData,
  quality: number,
): Promise<Blob> {
  const options = { type: WEBP_MIME_TYPE, quality: quality / 100 };
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(image.width, image.height);
    drawPixels(canvas.getContext('2d'), image);
    return canvas.convertToBlob(options);
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  drawPixels(canvas.getContext('2d'), image);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error('WebP encoding failed: the canvas produced no image'),
            ),
      options.type,
      options.quality,
    ),
  );
}

/**
 * Writes the pixels onto a fresh canvas's 2D context.
 *
 * @throws Error when the browser gave no 2D context
 */
function drawPixels(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null,
  image: ImageData,
): void {
  if (!context) {
    throw new Error('WebP encoding failed: the browser gave no 2D canvas');
  }
  context.putImageData(image, 0, 0);
}

/** jSquash's encode function, as its `@jsquash/webp/encode` default export has it. */
type JsquashEncode = (
  data: ImageData,
  options?: { quality?: number },
) => Promise<ArrayBuffer>;

/** The loaded and initialised jSquash encoder, shared by every call; reset when loading fails. */
let wasmEncoder: Promise<JsquashEncode> | undefined;

/**
 * Loads `@jsquash/webp/encode` on first use (its own lazy chunk, never in the initial bundle) and
 * points emscripten at the `.wasm` copies under {@link JSQUASH_WASM_DIR}. jSquash picks the SIMD
 * build itself when the browser supports it. A failed load is forgotten so the next call retries.
 */
function loadWasmEncoder(): Promise<JsquashEncode> {
  if (!wasmEncoder) {
    wasmEncoder = import('@jsquash/webp/encode').then(
      async ({ default: encode, init }) => {
        await init({
          locateFile: (file: string) =>
            new URL(`${JSQUASH_WASM_DIR}${file}`, document.baseURI).href,
        });
        return encode;
      },
    );
    wasmEncoder.catch(() => (wasmEncoder = undefined));
  }
  return wasmEncoder;
}

/**
 * Encodes with jSquash's WebAssembly build of libwebp — the main path on Safari, whose canvas
 * cannot produce WebP.
 */
export async function encodeWithWasm(
  image: ImageData,
  quality: number,
): Promise<Blob> {
  const encode = await loadWasmEncoder();
  const bytes = await encode(image, { quality });
  return new Blob([bytes], { type: WEBP_MIME_TYPE });
}

/**
 * Builds an encoder that tries the canvas first and switches to the WASM encoder for good once
 * the canvas has produced anything other than WebP — or has rejected, since how Safari's
 * `OffscreenCanvas` answers an `image/webp` request is unverified and the iPhone is the main
 * device. The canvas error is logged with `console.warn`; a WASM failure is rethrown untouched.
 *
 * @param canvas the native encoder; specs pass a fake
 * @param wasm the fallback encoder; specs pass a fake
 */
export function createWebpEncoder(
  canvas: CanvasEncoder = encodeOnCanvas,
  wasm: WebpEncoder = encodeWithWasm,
): WebpEncoder {
  let canvasMakesWebp: boolean | undefined;
  return async (image, quality) => {
    if (canvasMakesWebp !== false) {
      const blob = await canvas(image, quality).catch((error: unknown) => {
        console.warn(
          'Canvas WebP encoding failed; using the WASM encoder',
          error,
        );
        return null;
      });
      if (blob?.type === WEBP_MIME_TYPE) {
        canvasMakesWebp = true;
        return blob;
      }
      canvasMakesWebp = false;
    }
    return wasm(image, quality);
  };
}

/** The app's one encoder, so the canvas probe runs once per page load. */
const defaultEncoder = createWebpEncoder();

/**
 * Encodes pixels as WebP: on a canvas when the browser can (Chrome, Firefox), otherwise with the
 * lazily loaded jSquash WASM encoder (Safari on every platform).
 */
export function encodeWebp(image: ImageData, quality: number): Promise<Blob> {
  return defaultEncoder(image, quality);
}

/**
 * The WebP encoder the photo pipeline uses. Its default is the real {@link encodeWebp}: the
 * module only reaches jSquash through a dynamic `import()`, so the default drags no WASM into a
 * spec bundle. Specs that are not about encoding provide a fake.
 */
export const WEBP_ENCODER = new InjectionToken<WebpEncoder>('WEBP_ENCODER', {
  providedIn: 'root',
  factory: () => encodeWebp,
});
