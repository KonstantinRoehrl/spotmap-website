import type { Map as MapLibreMap } from 'maplibre-gl';
import type { SpotListCollection } from '../../../models/spots/spot';
import { spotIndexOf } from '../../../models/spots/spot-index';
import {
  drawPinImage,
  FLAG_REACH_PX,
  isOnPinImageBody,
  isOnRaisedFlag,
  loadCrossOriginPhoto,
  MAX_CONCURRENT_FADES,
  PhotoPins,
  PIN_IMAGE_HEIGHT,
  PIN_IMAGE_WIDTH,
  PIN_PIXEL_RATIO,
  type PinPhoto,
  RAISED_FRAME_HEIGHT,
  RAISED_FRAME_WIDTH,
  RAISED_STEM_PX,
} from './photo-pins';
import { PIN_IMAGE_LIFT_PX } from './spot-layers';
import { FakeMap } from './testing/fake-map';

const PHOTO_HOST = 'https://photos.test';
const PHOTOS = { thumb: (key: string) => `${PHOTO_HOST}/thumb/${key}` };

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
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.42, 48.24] },
      properties: {
        id: 'd',
        name: 'Delta',
        status: 'active',
        cover: 'vienna/d.webp',
        photoCount: 1,
      },
    },
  ],
};

/** A 1 × 1 PNG, so a real `<img>` has something to decode without touching the network. */
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
  it('draws every pin image at one size, twice the CSS pixels: the framed photo and its stem', () => {
    expect(PIN_IMAGE_WIDTH).toBe(56 + 2);
    expect(PIN_IMAGE_HEIGHT).toBe(42 + 2 + 8);
    for (const style of ['active', 'demolished'] as const) {
      const image = drawPinImage(null, style);
      expect(image.width).toBe(PIN_IMAGE_WIDTH * PIN_PIXEL_RATIO);
      expect(image.height).toBe(PIN_IMAGE_HEIGHT * PIN_PIXEL_RATIO);
    }
  });

  it('frames a standing spot’s photo pin in deep phosphor and a demolished one’s in dim phosphor', () => {
    // CSS (0.5, 23): inside the 1 px frame, which now starts at the image's edge.
    expect(pixel(drawPinImage(null, 'active'), 1, 46)).toEqual([0, 90, 0, 255]);
    expect(pixel(drawPinImage(null, 'demolished'), 1, 46)).toEqual([
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

describe('loadCrossOriginPhoto', () => {
  it('stops listening for the abort once the photo has loaded, and then leaves the image alone', async () => {
    const controller = new AbortController();
    const removed = spyOn(
      controller.signal,
      'removeEventListener',
    ).and.callThrough();
    const photo = (await loadCrossOriginPhoto(
      PIXEL_PNG,
      controller.signal,
    )) as HTMLImageElement;
    expect(removed).toHaveBeenCalledWith('abort', jasmine.any(Function));
    controller.abort();
    expect(photo.src).toBe(PIXEL_PNG);
  });

  it('rejects at once for a signal that has already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expectAsync(
      loadCrossOriginPhoto(PIXEL_PNG, controller.signal),
    ).toBeRejected();
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
      spotIndexOf(LIST),
      PHOTOS,
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
    expect(image?.width).toBe(PIN_IMAGE_WIDTH * PIN_PIXEL_RATIO);
    expect(image?.height).toBe(PIN_IMAGE_HEIGHT * PIN_PIXEL_RATIO);
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
    expect(fake.images.get('spot-photo:a')?.width).toBe(
      PIN_IMAGE_WIDTH * PIN_PIXEL_RATIO,
    );
    expect(frames).withContext('the fade is over').toEqual([]);
  });

  it('asks the map for a frame after every fade frame that drew, with no other map activity', async () => {
    resolveImage('spot-photo:a');
    fake.placedPhotos = [{ properties: { id: 'a' } }];
    fake.emit('idle');
    loads[0]!.resolve(greenPhoto());
    await settle();
    expect(fake.repaintRequests).withContext('before the fade').toBe(0);

    runFrames(1000);
    expect(fake.repaintRequests).withContext('first frame').toBe(1);
    runFrames(1100);
    expect(fake.repaintRequests).withContext('second frame').toBe(2);
    runFrames(1200);
    expect(fake.repaintRequests).withContext('the last frame').toBe(3);
  });

  it('asks for no frame when a fade frame drew nothing', async () => {
    resolveImage('spot-photo:a');
    fake.placedPhotos = [{ properties: { id: 'a' } }];
    fake.emit('idle');
    loads[0]!.resolve(greenPhoto());
    await settle();
    fake.images.delete('spot-photo:a');

    runFrames(1000);

    expect(fake.imageUpdates).toEqual([]);
    expect(fake.repaintRequests).toBe(0);
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

  describe('fetching placed photos', () => {
    afterEach(() => jasmine.clock().uninstall());

    it('fetches them once the map has rendered and gone quiet, without waiting for idle', () => {
      jasmine.clock().install();
      const query = spyOn(fake, 'queryRenderedFeatures').and.callThrough();
      resolveImage('spot-photo:a');
      fake.placedPhotos = [{ properties: { id: 'a' } }];
      for (let frame = 0; frame < 10; frame++) {
        fake.emit('render');
      }
      expect(loads).withContext('not on every frame').toEqual([]);
      jasmine.clock().tick(500);
      expect(loads.map((load) => load.url)).toEqual([
        `${PHOTO_HOST}/thumb/vienna/a.webp`,
      ]);
      expect(query)
        .withContext('one query for the burst')
        .toHaveBeenCalledTimes(1);
    });

    it('stops waiting on a quiet map when disposed', () => {
      jasmine.clock().install();
      resolveImage('spot-photo:a');
      fake.placedPhotos = [{ properties: { id: 'a' } }];
      fake.emit('render');
      pins.dispose();
      jasmine.clock().tick(500);
      expect(loads).toEqual([]);
      expect(fake.handlers.get('render')).toEqual([]);
    });
  });

  describe('the cost of drawing', () => {
    it('shares one placeholder between every pin of a style', () => {
      const canvases = spyOn(document, 'createElement').and.callThrough();
      resolveImage('spot-photo:a');
      resolveImage('spot-photo:d');
      const made = canvases.calls
        .allArgs()
        .filter(([tag]) => tag === 'canvas').length;
      expect(made).toBeLessThanOrEqual(1);
      expect(fake.images.get('spot-photo:d')?.data).toEqual(
        fake.images.get('spot-photo:a')!.data,
      );
    });

    it('runs every fade off one animation frame and caps how many run at once', async () => {
      pins.dispose();
      const many: SpotListCollection = {
        type: 'FeatureCollection',
        features: Array.from({ length: 20 }, (_, i) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [16 + i / 100, 48] },
          properties: {
            id: `s${i}`,
            name: `Spot ${i}`,
            status: 'active' as const,
            cover: `vienna/s${i}.webp`,
            photoCount: 1,
          },
        })),
      };
      pins = new PhotoPins(
        fake as unknown as MapLibreMap,
        spotIndexOf(many),
        PHOTOS,
        (url, signal) =>
          new Promise((resolve, reject) =>
            loads.push({ url, signal, resolve, reject }),
          ),
      );
      pins.install();
      for (let i = 0; i < 20; i++) {
        resolveImage(`spot-photo:s${i}`);
      }
      fake.placedPhotos = many.features.map((feature) => ({
        properties: { id: feature.properties.id },
      }));
      fake.emit('idle');
      for (const load of loads) {
        load.resolve(greenPhoto());
      }
      await settle();
      expect(frames.length).withContext('one frame loop').toBe(1);
      runFrames(1000);
      expect(fake.imageUpdates.length).toBeLessThanOrEqual(
        MAX_CONCURRENT_FADES,
      );
      for (let now = 1100, turns = 0; frames.length && turns < 50; turns++) {
        runFrames(now);
        now += 100;
      }
      expect(new Set(fake.imageUpdates).size)
        .withContext('every pin fades in')
        .toBe(20);
      expect(frames).toEqual([]);
    });
  });

  it('lets go of its listeners, frames and pending fetches on dispose', async () => {
    resolveImage('spot-photo:a');
    resolveImage('spot-photo:d');
    fake.placedPhotos = [
      { properties: { id: 'a' } },
      { properties: { id: 'd' } },
    ];
    fake.emit('idle');
    loads[0]!.resolve(greenPhoto());
    await settle();
    // loads[0] is a's photo, now fading; loads[1] is d's, still pending.
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

describe('isOnPinImageBody', () => {
  /** A pin on a 1000 px wide map, 300 px down. */
  const PIN = { x: 500, y: 300 };

  it('holds the framed photo above the stem and the lift', () => {
    // The image stands 8 px above the pin: a 44 px framed photo over an 8 px stem band.
    expect(isOnPinImageBody(PIN, { x: 500, y: 260 })).toBeTrue();
    expect(isOnPinImageBody(PIN, { x: 471, y: 245 })).toBeTrue();
  });

  it('leaves out the transparent stem band at the foot of the image', () => {
    expect(isOnPinImageBody(PIN, { x: 500, y: 288 })).toBeFalse();
    expect(isOnPinImageBody(PIN, { x: 480, y: 292 })).toBeFalse();
  });

  it('leaves out what lies beside or above the image', () => {
    expect(isOnPinImageBody(PIN, { x: 531, y: 260 })).toBeFalse();
    expect(isOnPinImageBody(PIN, { x: 500, y: 230 })).toBeFalse();
  });
});

describe('the raised flag', () => {
  /** A pin on a 1000 px wide map, 300 px down. */
  const PIN = { x: 500, y: 300 };

  it('is about one and a half times the photo pin, in a 2 px frame', () => {
    expect(RAISED_FRAME_WIDTH).toBe(84 + 4);
    expect(RAISED_FRAME_HEIGHT).toBe(63 + 4);
    expect(RAISED_FRAME_WIDTH / PIN_IMAGE_WIDTH).toBeCloseTo(1.5, 1);
  });

  it('reaches the lift, its stem and its framed photo above the pin', () => {
    expect(FLAG_REACH_PX).toBe(
      PIN_IMAGE_LIFT_PX + RAISED_STEM_PX + RAISED_FRAME_HEIGHT,
    );
    expect(FLAG_REACH_PX).toBe(99);
  });

  it('takes a point anywhere on its framed photo', () => {
    // The frame spans x 456–544 and y 201–268: 8 + 24 px up to its foot, 67 px tall.
    expect(isOnRaisedFlag(PIN, { x: 500, y: 240 })).toBeTrue();
    expect(isOnRaisedFlag(PIN, { x: 456, y: 201 })).toBeTrue();
    expect(isOnRaisedFlag(PIN, { x: 544, y: 268 })).toBeTrue();
  });

  it('leaves out its thin stem, the pin, and what lies beside or above it', () => {
    expect(isOnRaisedFlag(PIN, { x: 500, y: 280 })).toBeFalse();
    expect(isOnRaisedFlag(PIN, { x: 500, y: 300 })).toBeFalse();
    expect(isOnRaisedFlag(PIN, { x: 545, y: 240 })).toBeFalse();
    expect(isOnRaisedFlag(PIN, { x: 500, y: 200 })).toBeFalse();
  });
});
