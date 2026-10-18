import { TestBed } from '@angular/core/testing';
import type { LngLat } from '../../../models/admin/admin-spot';
import { GPS_READER, GpsReader } from './exif-gps';
import {
  decodePhoto,
  isHeic,
  PHOTO_DECODER,
  PhotoDecoder,
} from './photo-decode';
import { PhotoPipeline } from './photo-pipeline';
import { MAX_OBJECT_BYTES, PhotoPipelineError } from './renditions';
import {
  FIXTURE_GPS,
  fixtureFile,
  ORIENTED_GPS_JPEG_BASE64,
  PLAIN_HEIC_BASE64,
  PLAIN_JPEG_BASE64,
} from './testing/photo-fixtures';
import { WEBP_ENCODER, WebpEncoder } from './webp-encode';

/** The RGBA of one pixel of a decoded bitmap. */
function pixel(bitmap: ImageBitmap, x: number, y: number): number[] {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  return Array.from(context.getImageData(x, y, 1, 1).data);
}

/** True when the pixel is clearly the fixtures' red, false when clearly their blue. */
function isRed([r, , b]: number[]): boolean {
  return r > 200 && b < 60;
}
function isBlue([r, , b]: number[]): boolean {
  return b > 200 && r < 60;
}

describe('decodePhoto', () => {
  it('applies the EXIF orientation (Orientation 6 turns 40×20 into 20×40, red on top)', async () => {
    const bitmap = await decodePhoto(
      fixtureFile(ORIENTED_GPS_JPEG_BASE64, 'IMG_0001.JPG', 'image/jpeg'),
    );
    expect([bitmap.width, bitmap.height]).toEqual([20, 40]);
    expect(isRed(pixel(bitmap, 10, 5))).toBeTrue();
    expect(isBlue(pixel(bitmap, 10, 35))).toBeTrue();
  });

  it('keeps a photo without EXIF as stored', async () => {
    const bitmap = await decodePhoto(
      fixtureFile(PLAIN_JPEG_BASE64, 'plain.jpg', 'image/jpeg'),
    );
    expect([bitmap.width, bitmap.height]).toEqual([40, 20]);
    expect(isRed(pixel(bitmap, 5, 10))).toBeTrue();
  });

  it('decodes HEIC through heic-to when the browser cannot', async () => {
    const bitmap = await decodePhoto(
      fixtureFile(PLAIN_HEIC_BASE64, 'IMG_0002.HEIC', 'image/heic'),
    );
    expect([bitmap.width, bitmap.height]).toEqual([40, 20]);
    expect(isRed(pixel(bitmap, 5, 10))).toBeTrue();
    expect(isBlue(pixel(bitmap, 35, 10))).toBeTrue();
  });

  it('reports a damaged HEIC as decode-failed', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'broken.heic', {
      type: 'image/heic',
    });
    await expectAsync(decodePhoto(file)).toBeRejectedWith(
      jasmine.objectContaining({ kind: 'decode-failed' }),
    );
  });

  it('reports a damaged JPEG as decode-failed', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'broken.jpg', {
      type: 'image/jpeg',
    });
    await expectAsync(decodePhoto(file)).toBeRejectedWith(
      jasmine.objectContaining({ kind: 'decode-failed' }),
    );
  });

  it('reports a file that is no image as unsupported-format, naming it', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const error = await decodePhoto(file).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toEqual(jasmine.any(PhotoPipelineError));
    expect((error as PhotoPipelineError).kind).toBe('unsupported-format');
    expect((error as PhotoPipelineError).message).toContain('notes.txt');
  });

  it('is the default PHOTO_DECODER', () => {
    expect(TestBed.inject(PHOTO_DECODER)).toBe(decodePhoto);
  });
});

describe('isHeic', () => {
  it('recognises HEIC and HEIF by MIME type', () => {
    expect(isHeic(new File([], 'a', { type: 'image/heic' }))).toBeTrue();
    expect(isHeic(new File([], 'a', { type: 'image/heif' }))).toBeTrue();
  });

  it('recognises HEIC by extension when the browser reports no type', () => {
    expect(isHeic(new File([], 'IMG_0003.HEIC', { type: '' }))).toBeTrue();
    expect(isHeic(new File([], 'photo.heif', { type: '' }))).toBeTrue();
  });

  it('does not take a JPEG for HEIC', () => {
    expect(isHeic(new File([], 'a.jpg', { type: 'image/jpeg' }))).toBeFalse();
  });
});

/** One call the fake encoder received. */
interface EncodeCall {
  width: number;
  height: number;
  quality: number;
}

describe('PhotoPipeline', () => {
  let calls: EncodeCall[];
  let sourceSize: { width: number; height: number };
  let gps: LngLat | null;
  /** What the fake encoder returns for a call; defaults to a small WebP blob per quality. */
  let encodeResult: (call: EncodeCall) => Promise<Blob>;

  const fakeDecoder: PhotoDecoder = () =>
    createImageBitmap(new ImageData(sourceSize.width, sourceSize.height));
  const fakeGpsReader: GpsReader = () => Promise.resolve(gps);
  const fakeEncoder: WebpEncoder = (image, quality) => {
    const call = { width: image.width, height: image.height, quality };
    calls.push(call);
    return encodeResult(call);
  };

  function pipeline(): PhotoPipeline {
    TestBed.configureTestingModule({
      providers: [
        { provide: PHOTO_DECODER, useValue: fakeDecoder },
        { provide: GPS_READER, useValue: fakeGpsReader },
        { provide: WEBP_ENCODER, useValue: fakeEncoder },
      ],
    });
    return TestBed.inject(PhotoPipeline);
  }

  const photo = () => new File(['x'], 'IMG_0004.JPG', { type: 'image/jpeg' });

  beforeEach(() => {
    calls = [];
    sourceSize = { width: 4032, height: 3024 };
    gps = null;
    encodeResult = ({ quality }) =>
      Promise.resolve(
        new Blob([quality === 72 ? 'abc' : 'thumb'], { type: 'image/webp' }),
      );
  });

  it('caps the full rendition at 1400 px, quality 72, and the thumbnail at 640 px, quality 70', async () => {
    const result = await pipeline().process(photo());
    expect(calls).toEqual([
      { width: 1400, height: 1050, quality: 72 },
      { width: 640, height: 480, quality: 70 },
    ]);
    expect([result.width, result.height]).toEqual([1400, 1050]);
  });

  it('never enlarges a small photo', async () => {
    sourceSize = { width: 300, height: 200 };
    await pipeline().process(photo());
    expect(calls).toEqual([
      { width: 300, height: 200, quality: 72 },
      { width: 300, height: 200, quality: 70 },
    ]);
  });

  it('sizes the thumbnail from the full rendition, as the extractor does', async () => {
    // 3000×1999 → full 1400×933 → thumb 640×427 (straight from 3000×1999 it would be 640×426).
    sourceSize = { width: 3000, height: 1999 };
    await pipeline().process(photo());
    expect(calls[1]).toEqual({ width: 640, height: 427, quality: 70 });
  });

  it('names the photo by the first 8 hex of the full rendition’s SHA-256', async () => {
    const result = await pipeline().process(photo());
    expect(result.hash8).toBe('ba7816bf'); // sha256('abc')
    expect(await result.full.text()).toBe('abc');
    expect(await result.thumb.text()).toBe('thumb');
  });

  it('passes the GPS guess and the file name through', async () => {
    gps = FIXTURE_GPS;
    const result = await pipeline().process(photo());
    expect(result.gps).toEqual(FIXTURE_GPS);
    expect(result.sourceName).toBe('IMG_0004.JPG');
  });

  it('refuses a rendition over the bucket limit as too-large', async () => {
    encodeResult = () =>
      Promise.resolve(
        new Blob([new Uint8Array(MAX_OBJECT_BYTES + 1)], {
          type: 'image/webp',
        }),
      );
    await expectAsync(pipeline().process(photo())).toBeRejectedWith(
      jasmine.objectContaining({ kind: 'too-large' }),
    );
  });

  it('accepts a rendition of exactly the bucket limit', async () => {
    encodeResult = () =>
      Promise.resolve(
        new Blob([new Uint8Array(MAX_OBJECT_BYTES)], { type: 'image/webp' }),
      );
    await expectAsync(pipeline().process(photo())).toBeResolved();
  });

  it('reports an encoder failure as encode-failed', async () => {
    encodeResult = () => Promise.reject(new Error('wasm trap'));
    await expectAsync(pipeline().process(photo())).toBeRejectedWith(
      jasmine.objectContaining({ kind: 'encode-failed' }),
    );
  });

  it('reports an encoder that does not produce WebP as encode-failed', async () => {
    encodeResult = () =>
      Promise.resolve(new Blob(['png'], { type: 'image/png' }));
    await expectAsync(pipeline().process(photo())).toBeRejectedWith(
      jasmine.objectContaining({ kind: 'encode-failed' }),
    );
  });

  it('passes a decode failure through unchanged', async () => {
    const failure = new PhotoPipelineError('unsupported-format', 'notes.txt …');
    TestBed.configureTestingModule({
      providers: [
        { provide: PHOTO_DECODER, useValue: () => Promise.reject(failure) },
        { provide: GPS_READER, useValue: fakeGpsReader },
        { provide: WEBP_ENCODER, useValue: fakeEncoder },
      ],
    });
    await expectAsync(
      TestBed.inject(PhotoPipeline).process(photo()),
    ).toBeRejectedWith(failure);
    expect(calls).toEqual([]);
  });
});

/** The FourCC ids of a WebP's RIFF chunks, in file order (header `RIFF <size> WEBP` skipped). */
function riffChunkIds(bytes: Uint8Array): string[] {
  const ascii = (start: number) =>
    String.fromCharCode(...bytes.subarray(start, start + 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ids: string[] = [];
  for (let offset = 12; offset + 8 <= bytes.length;) {
    ids.push(ascii(offset));
    const size = view.getUint32(offset + 4, true);
    offset += 8 + size + (size % 2);
  }
  return ids;
}

describe('PhotoPipeline with the real decoder, GPS reader and encoder', () => {
  it('writes upright WebP renditions with no EXIF and no GPS, keeping GPS only in memory', async () => {
    const result = await TestBed.inject(PhotoPipeline).process(
      fixtureFile(ORIENTED_GPS_JPEG_BASE64, 'IMG_0001.JPG', 'image/jpeg'),
    );

    // The source really had GPS, and the pipeline read it for the picker…
    expect(result.gps?.lat ?? Number.NaN).toBeCloseTo(FIXTURE_GPS.lat, 6);
    expect(result.gps?.lng ?? Number.NaN).toBeCloseTo(FIXTURE_GPS.lng, 6);

    for (const blob of [result.full, result.thumb]) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      // …but neither rendition carries it: WebP, no EXIF or XMP chunk, no JPEG-style Exif marker.
      expect(blob.type).toBe('image/webp');
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
      expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe('WEBP');
      const chunks = riffChunkIds(bytes);
      expect(chunks).not.toContain('EXIF');
      expect(chunks).not.toContain('XMP ');
      expect(new TextDecoder('latin1').decode(bytes)).not.toContain('Exif');
    }

    // The orientation is baked into the pixels: the 40×20 source comes out 20×40.
    expect([result.width, result.height]).toEqual([20, 40]);
    const decoded = await createImageBitmap(result.full);
    expect([decoded.width, decoded.height]).toEqual([20, 40]);
  });
});
