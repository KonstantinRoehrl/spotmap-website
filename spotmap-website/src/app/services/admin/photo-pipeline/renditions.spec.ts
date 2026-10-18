import { contentHash8, photoKey, sha256Hex } from './hashing';
import {
  FULL_RENDITION,
  fitWithin,
  MAX_OBJECT_BYTES,
  PhotoPipelineError,
  THUMB_RENDITION,
} from './renditions';

describe('renditions', () => {
  it('match the extractor: 1400 px at quality 72, 640 px at quality 70', () => {
    expect(FULL_RENDITION).toEqual({ longEdgePx: 1400, quality: 72 });
    expect(THUMB_RENDITION).toEqual({ longEdgePx: 640, quality: 70 });
  });

  it('cap an object at the bucket limit of 2 MiB', () => {
    expect(MAX_OBJECT_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe('fitWithin', () => {
  // Every expectation is the size sharp's resize({ fit: 'inside', withoutEnlargement: true })
  // produces for the same input, which is what tools/extract-spots writes.
  const cases: [number, number, number, number, number][] = [
    [4032, 3024, 1400, 1400, 1050],
    [3000, 1999, 1400, 1400, 933],
    [1401, 999, 1400, 1400, 998],
    [3024, 4032, 640, 480, 640],
    [1920, 1080, 640, 640, 360],
    [5000, 3, 1400, 1400, 1],
  ];
  for (const [width, height, edge, outWidth, outHeight] of cases) {
    it(`fits ${width}×${height} inside ${edge} px as ${outWidth}×${outHeight}`, () => {
      expect(fitWithin(width, height, edge)).toEqual({
        width: outWidth,
        height: outHeight,
      });
    });
  }

  it('never enlarges an image already inside the long edge', () => {
    expect(fitWithin(800, 600, 1400)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1400, 900, 1400)).toEqual({ width: 1400, height: 900 });
  });
});

describe('PhotoPipelineError', () => {
  it('is an Error that carries its kind', () => {
    const error = new PhotoPipelineError('too-large', 'over the limit');
    expect(error).toEqual(jasmine.any(Error));
    expect(error.kind).toBe('too-large');
    expect(error.name).toBe('PhotoPipelineError');
    expect(error.message).toBe('over the limit');
  });
});

describe('hashing', () => {
  const abc = new TextEncoder().encode('abc');

  it('hashes bytes with SHA-256 as lowercase hex', () => {
    expect(sha256Hex(abc)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('names content by the first 8 hex of its SHA-256', () => {
    expect(contentHash8(abc)).toBe('ba7816bf');
  });

  it('builds the object key <city>/<spot-id>-<8 hex>.webp', () => {
    expect(photoKey('vienna', 'hbf-curb-99f6e5', 'ba7816bf')).toBe(
      'vienna/hbf-curb-99f6e5-ba7816bf.webp',
    );
  });
});
