import type { Map as MapLibreMap } from 'maplibre-gl';
import type { SpotListCollection } from '../../../models/spots/spot';
import {
  drawPinImage,
  PhotoPins,
  PIN_IMAGE_HEIGHT,
  PIN_IMAGE_WIDTH,
  PIN_PIXEL_RATIO,
  type PinPhoto,
} from './photo-pins';
import { FakeMap } from './testing/fake-map';

const PHOTO_HOST = 'https://photos.test';

/** Three spots: one standing with photos, one demolished with a photo, one with none. */
const LIST: SpotListCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.37, 48.2] },
      properties: {
        id: 'a',
        name: 'Alpha',
        status: 'active',
        cover: 'vienna/a.webp',
        photoCount: 2,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.4, 48.22] },
      properties: {
        id: 'b',
        name: 'Beta',
        status: 'demolished',
        cover: 'vienna/b.webp',
        photoCount: 1,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.41, 48.23] },
      properties: {
        id: 'c',
        name: 'Gamma',
        status: 'active',
        cover: null,
        photoCount: 0,
      },
    },
  ],
};

/** A 64 × 48 photo of pure phosphor green, to read drawn pixels against. */
function greenPhoto(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#00ff00';
  context.fillRect(0, 0, 64, 48);
  return canvas;
}

/** The RGBA of one device pixel of a drawn pin image. */
function pixel(image: ImageData, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4;
  return Array.from(image.data.slice(i, i + 4));
}

describe('drawPinImage', () => {
  it('draws every pin image at one size, twice the CSS pixels', () => {
    for (const style of ['active', 'demolished', 'flag'] as const) {
      const image = drawPinImage(null, style);
      expect(image.width).toBe(PIN_IMAGE_WIDTH * PIN_PIXEL_RATIO);
      expect(image.height).toBe(PIN_IMAGE_HEIGHT * PIN_PIXEL_RATIO);
    }
  });

  it('frames a photo pin in deep phosphor and the flag in amber', () => {
    // CSS (1.5, 23): inside the photo pin's 1 px frame; CSS (0.5, 23): inside the flag's 2 px one.
    expect(pixel(drawPinImage(null, 'active'), 3, 46)).toEqual([0, 90, 0, 255]);
    expect(pixel(drawPinImage(null, 'flag'), 1, 46)).toEqual([
      255, 176, 0, 255,
    ]);
    expect(pixel(drawPinImage(null, 'demolished'), 3, 46)).toEqual([
      0, 184, 0, 255,
    ]);
  });

  it('fills a placeholder with the surface until its photo arrives', () => {
    expect(pixel(drawPinImage(null, 'active'), 60, 46)).toEqual([
      10, 15, 10, 255,
    ]);
  });

  it('draws the photo in full, and a demolished spot’s dimmed', () => {
    expect(pixel(drawPinImage(greenPhoto(), 'active'), 60, 46)).toEqual([
      0, 255, 0, 255,
    ]);
    const [, green] = pixel(drawPinImage(greenPhoto(), 'demolished'), 60, 46);
    expect(green).toBeGreaterThan(140);
    expect(green).toBeLessThan(155);
  });

  it('fades the photo in by its alpha', () => {
    expect(pixel(drawPinImage(greenPhoto(), 'active', 0), 60, 46)).toEqual([
      10, 15, 10, 255,
    ]);
  });

  it('leaves everything outside the frame and the stem clear', () => {
    expect(pixel(drawPinImage(null, 'active'), 0, 100)[3]).toBe(0);
  });
});

describe('PhotoPins', () => {
  let fake: FakeMap;
  let pins: PhotoPins;
  let loads: {
    url: string;
    signal: AbortSignal;
    resolve: (photo: PinPhoto) => void;
    reject: (reason: unknown) => void;
  }[];
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    fake = new FakeMap();
    loads = [];
    frames = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      frames.push(callback);
      return frames.length;
    });
    spyOn(window, 'cancelAnimationFrame');
    pins = new PhotoPins(
      fake as unknown as MapLibreMap,
      LIST,
      PHOTO_HOST,
      (url, signal) =>
        new Promise((resolve, reject) =>
          loads.push({ url, signal, resolve, reject }),
        ),
    );
    pins.install();
  });

  afterEach(() => {
    pins.dispose();
    fake.remove();
  });

  const resolveImage = (id: string) => fake.missingImageResolver!(id);
  /** Runs the frames waiting now, at `now`. */
  const runFrames = (now: number) => {
    for (const callback of frames.splice(0)) {
      callback(now);
    }
  };
  /** Lets a settled load's continuation run. */
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve));

  it('answers a missing photo pin image with a placeholder at once, fetching nothing', () => {
    resolveImage('spot-photo:a');
    const image = fake.images.get('spot-photo:a');
    expect(image?.width).toBe(120);
    expect(image?.height).toBe(108);
    expect(fake.imageOptions.get('spot-photo:a')).toEqual({ pixelRatio: 2 });
    expect(loads).toEqual([]);
  });

  it('leaves images it does not draw, and spots with no photo, alone', () => {
    resolveImage('some-icon');
    resolveImage('spot-photo:c');
    resolveImage('spot-photo:nobody');
    expect(fake.images.size).toBe(0);
  });

  it('fetches the photos of the placed pins only, once each', () => {
    resolveImage('spot-photo:a');
    resolveImage('spot-photo:b');
    fake.placedPhotos = [{ properties: { id: 'a' } }];
    fake.emit('idle');
    fake.emit('moveend');
    expect(loads.map((load) => load.url)).toEqual([
      `${PHOTO_HOST}/thumb/vienna/a.webp`,
    ]);
  });

  it('fades a fetched photo in through updates of the same size, then stops', async () => {
    resolveImage('spot-photo:a');
    fake.placedPhotos = [{ properties: { id: 'a' } }];
    fake.emit('idle');
    loads[0]!.resolve(greenPhoto());
    await settle();
    runFrames(1000);
    runFrames(1100);
    runFrames(1200);
    expect(fake.imageUpdates).toEqual([
      'spot-photo:a',
      'spot-photo:a',
      'spot-photo:a',
    ]);
    expect(fake.images.get('spot-photo:a')?.width).toBe(120);
    expect(frames).withContext('the fade is over').toEqual([]);
  });

  it('keeps the placeholder for a photo that fails, and never asks again', async () => {
    resolveImage('spot-photo:a');
    fake.placedPhotos = [{ properties: { id: 'a' } }];
    fake.emit('idle');
    loads[0]!.reject(new Error('gone'));
    await settle();
    fake.emit('idle');
    expect(loads.length).toBe(1);
    expect(fake.imageUpdates).toEqual([]);
    expect(fake.hasImage('spot-photo:a')).toBeTrue();
  });

  it('fetches the flag’s photo at once', () => {
    resolveImage('spot-flag:a');
    expect(fake.hasImage('spot-flag:a')).toBeTrue();
    expect(loads.map((load) => load.url)).toEqual([
      `${PHOTO_HOST}/thumb/vienna/a.webp`,
    ]);
  });

  it('lets go of its listeners, frames and pending fetches on dispose', async () => {
    resolveImage('spot-photo:a');
    resolveImage('spot-flag:b');
    fake.placedPhotos = [{ properties: { id: 'a' } }];
    fake.emit('idle');
    loads[0]!.resolve(greenPhoto());
    await settle();
    // loads[0] is the flag's photo, fetched at once and now fading; loads[1] is a's, still pending.
    pins.dispose();
    expect(loads.every((load) => load.signal.aborted)).toBeTrue();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(fake.handlers.get('idle')).toEqual([]);
    expect(fake.handlers.get('moveend')).toEqual([]);
    loads[1]!.resolve(greenPhoto());
    await settle();
    runFrames(2000);
    expect(fake.imageUpdates).toEqual([]);
  });
});
