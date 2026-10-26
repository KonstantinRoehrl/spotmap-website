import { TestBed } from '@angular/core/testing';

import {
  createWebpEncoder,
  encodeOnCanvas,
  encodeWebp,
  encodeWithWasm,
  JSQUASH_WASM_DIR,
  WEBP_ENCODER,
} from './webp-encode';

/** A 4 × 3 opaque gradient: encodes in milliseconds and is not one flat colour. */
function sampleImage(): ImageData {
  const image = new ImageData(4, 3);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = i * 5;
    image.data[i + 1] = 128;
    image.data[i + 2] = 255 - i * 5;
    image.data[i + 3] = 255;
  }
  return image;
}

/** A WebP file opens with `RIFF`, a 4-byte little-endian size, then `WEBP`. */
async function riffHeader(blob: Blob): Promise<[string, string]> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const fourCc = (from: number) =>
    String.fromCharCode(...head.slice(from, from + 4));
  return [fourCc(0), fourCc(8)];
}

describe('webp-encode', () => {
  describe('encodeOnCanvas', () => {
    it('produces a RIFF/WEBP blob where the browser encodes WebP natively (headless Chrome)', async () => {
      const blob = await encodeOnCanvas(sampleImage(), 72);

      expect(blob.type).toBe('image/webp');
      expect(await riffHeader(blob)).toEqual(['RIFF', 'WEBP']);
    });
  });

  describe('encodeWithWasm', () => {
    it('loads the jSquash WASM from the served jsquash/ assets and produces a RIFF/WEBP blob', async () => {
      // The 250-entry resource-timing buffer is already full of the test bundle's chunk files.
      performance.clearResourceTimings();
      const blob = await encodeWithWasm(sampleImage(), 72);

      expect(blob.type).toBe('image/webp');
      expect(await riffHeader(blob)).toEqual(['RIFF', 'WEBP']);
      const wasmFetches = performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => path.endsWith('.wasm'));
      expect(wasmFetches.length).toBeGreaterThan(0);
      expect(
        wasmFetches.every((path) =>
          /\/jsquash\/webp_enc(_simd)?\.wasm$/.test(path),
        ),
      )
        .withContext(wasmFetches.join(', '))
        .toBe(true);
    });
  });

  describe('createWebpEncoder', () => {
    const webp = new Blob(['webp'], { type: 'image/webp' });
    const png = new Blob(['png'], { type: 'image/png' });

    it('returns the canvas blob and never touches the WASM encoder when the canvas yields WebP', async () => {
      const canvas = jasmine.createSpy('canvas').and.resolveTo(webp);
      const wasm = jasmine.createSpy('wasm');
      const image = sampleImage();

      const blob = await createWebpEncoder(canvas, wasm)(image, 72);

      expect(blob).toBe(webp);
      expect(canvas).toHaveBeenCalledOnceWith(image, 72);
      expect(wasm).not.toHaveBeenCalled();
    });

    it('falls back to the WASM encoder when the canvas yields another type (Safari returns PNG)', async () => {
      const canvas = jasmine.createSpy('canvas').and.resolveTo(png);
      const wasm = jasmine.createSpy('wasm').and.resolveTo(webp);
      const image = sampleImage();

      const blob = await createWebpEncoder(canvas, wasm)(image, 70);

      expect(blob).toBe(webp);
      expect(wasm).toHaveBeenCalledOnceWith(image, 70);
    });

    it('stops asking the canvas once it has produced a non-WebP blob', async () => {
      const canvas = jasmine.createSpy('canvas').and.resolveTo(png);
      const wasm = jasmine.createSpy('wasm').and.resolveTo(webp);
      const encode = createWebpEncoder(canvas, wasm);

      await encode(sampleImage(), 72);
      await encode(sampleImage(), 70);

      expect(canvas).toHaveBeenCalledTimes(1);
      expect(wasm).toHaveBeenCalledTimes(2);
    });

    it('falls back to the WASM encoder, for good, when the canvas rejects', async () => {
      const warn = spyOn(console, 'warn');
      const canvas = jasmine
        .createSpy('canvas')
        .and.rejectWith(new Error('The operation is not supported.'));
      const wasm = jasmine.createSpy('wasm').and.resolveTo(webp);
      const encode = createWebpEncoder(canvas, wasm);

      await expectAsync(encode(sampleImage(), 72)).toBeResolvedTo(webp);
      await expectAsync(encode(sampleImage(), 70)).toBeResolvedTo(webp);

      expect(canvas).toHaveBeenCalledTimes(1);
      expect(wasm).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledOnceWith(
        'Canvas WebP encoding failed; using the WASM encoder',
        jasmine.any(Error),
      );
    });

    it('rethrows a WASM failure instead of hiding it', async () => {
      const canvas = jasmine.createSpy('canvas').and.resolveTo(png);
      const wasm = jasmine
        .createSpy('wasm')
        .and.rejectWith(new Error('Encoding error.'));

      await expectAsync(
        createWebpEncoder(canvas, wasm)(sampleImage(), 72),
      ).toBeRejectedWithError('Encoding error.');
    });
  });

  it('serves the WASM from jsquash/ under the document base', () => {
    expect(JSQUASH_WASM_DIR).toBe('jsquash/');
  });

  it('provides encodeWebp through WEBP_ENCODER by default', () => {
    expect(TestBed.inject(WEBP_ENCODER)).toBe(encodeWebp);
  });

  it('encodes end to end through encodeWebp', async () => {
    const blob = await encodeWebp(sampleImage(), 72);

    expect(blob.type).toBe('image/webp');
    expect(await riffHeader(blob)).toEqual(['RIFF', 'WEBP']);
  });
});
