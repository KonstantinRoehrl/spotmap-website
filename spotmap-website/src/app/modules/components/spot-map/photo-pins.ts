import type { Map as MapLibreMap } from 'maplibre-gl';
import type {
  SpotListCollection,
  SpotListFeature,
} from '../../../models/spots/spot';
import { photoUrl } from '../../../services/spotmap-backend';
import { TERMINAL_PALETTE } from './map-palette';
import {
  FLAG_IMAGE_PREFIX,
  PHOTO_PIN_IMAGE_PREFIX,
  SPOT_PHOTO_LAYER_ID,
} from './spot-layers';

/** The photo's box inside its frame, in CSS px: a 4:3 crop small enough to sit on a pin. */
const PHOTO_WIDTH = 56;
/** The photo box's height, in CSS px: three quarters of {@link PHOTO_WIDTH}. */
const PHOTO_HEIGHT = 42;

/** A photo pin's frame, in CSS px. */
const PIN_FRAME_PX = 1;

/**
 * The flag's frame, in CSS px. Every image is sized for it and a photo pin's frame sits inset by
 * the difference, so a flag lands exactly over the photo pin it stands in for.
 */
const FLAG_FRAME_PX = 2;

/** The stem from the frame down to the pin, in CSS px. */
const STEM_PX = 8;

/** The frame's corner radius: R1's 4 px. */
const FRAME_RADIUS_PX = 4;

/** How far a demolished spot's photo is dimmed, so the "gone" state still reads. */
const DEMOLISHED_PHOTO_ALPHA = 0.55;

/** Every pin image's width in CSS px: the photo inside the flag's frame. */
export const PIN_IMAGE_WIDTH = PHOTO_WIDTH + 2 * FLAG_FRAME_PX;

/** Every pin image's height in CSS px: the framed photo and its stem. */
export const PIN_IMAGE_HEIGHT = PHOTO_HEIGHT + 2 * FLAG_FRAME_PX + STEM_PX;

/** Device pixels per CSS px the images are drawn at, so they stay sharp on a phone. */
export const PIN_PIXEL_RATIO = 2;

/** How long a fetched photo takes to fade into its placeholder frame. */
export const PHOTO_FADE_MS = 200;

/** How a pin image is framed: a standing spot, a demolished one, or the selection's flag. */
export type PinStyle = 'active' | 'demolished' | 'flag';

/** What a pin image can draw its photo from. */
export type PinPhoto = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** Fetches and decodes one photo, giving up when `signal` aborts. */
export type PhotoLoader = (
  url: string,
  signal: AbortSignal,
) => Promise<PinPhoto>;

/**
 * Draws one pin image: the photo (or, before it arrives, the `surface` fill) cover-cropped into a
 * 4 px-rounded frame on a stem — `phosphor-deep` for a standing spot, `phosphor-dim` with the photo
 * dimmed for a demolished one, a 2 px `amber` frame for the flag. `photoAlpha` fades the photo in.
 */
export function drawPinImage(
  photo: PinPhoto | null,
  style: PinStyle,
  photoAlpha = 1,
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_IMAGE_WIDTH * PIN_PIXEL_RATIO;
  canvas.height = PIN_IMAGE_HEIGHT * PIN_PIXEL_RATIO;
  const context = canvas.getContext('2d')!;
  context.scale(PIN_PIXEL_RATIO, PIN_PIXEL_RATIO);

  const frameWidth = style === 'flag' ? FLAG_FRAME_PX : PIN_FRAME_PX;
  const inset = FLAG_FRAME_PX - frameWidth;
  const frame = {
    x: inset,
    y: inset,
    width: PIN_IMAGE_WIDTH - 2 * inset,
    height: PHOTO_HEIGHT + 2 * FLAG_FRAME_PX - 2 * inset,
  };
  context.fillStyle =
    style === 'flag'
      ? TERMINAL_PALETTE.amber
      : style === 'demolished'
        ? TERMINAL_PALETTE.phosphorDim
        : TERMINAL_PALETTE.phosphorDeep;
  context.fillRect(
    PIN_IMAGE_WIDTH / 2 - frameWidth / 2,
    frame.y + frame.height,
    frameWidth,
    PIN_IMAGE_HEIGHT - frame.y - frame.height,
  );
  context.beginPath();
  context.roundRect(
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    FRAME_RADIUS_PX,
  );
  context.fill();

  const box = {
    x: frame.x + frameWidth,
    y: frame.y + frameWidth,
    width: PHOTO_WIDTH,
    height: PHOTO_HEIGHT,
  };
  context.beginPath();
  context.roundRect(
    box.x,
    box.y,
    box.width,
    box.height,
    FRAME_RADIUS_PX - frameWidth,
  );
  context.fillStyle = TERMINAL_PALETTE.surface;
  context.fill();
  if (photo) {
    context.save();
    context.clip();
    context.globalAlpha =
      photoAlpha * (style === 'demolished' ? DEMOLISHED_PHOTO_ALPHA : 1);
    drawCover(context, photo, box);
    context.restore();
  }
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Draws `photo` over `box`, cropped to fill it at its own aspect ratio. */
function drawCover(
  context: CanvasRenderingContext2D,
  photo: PinPhoto,
  box: { x: number; y: number; width: number; height: number },
): void {
  const width =
    photo instanceof HTMLImageElement ? photo.naturalWidth : photo.width;
  const height =
    photo instanceof HTMLImageElement ? photo.naturalHeight : photo.height;
  const scale = Math.max(box.width / width, box.height / height);
  const cropWidth = box.width / scale;
  const cropHeight = box.height / scale;
  context.drawImage(
    photo,
    (width - cropWidth) / 2,
    (height - cropHeight) / 2,
    cropWidth,
    cropHeight,
    box.x,
    box.y,
    box.width,
    box.height,
  );
}

/**
 * The page's photo loader: an `<img>` fetched with CORS — the photo host answers
 * `access-control-allow-origin: *` — so the canvas it is drawn on stays readable for MapLibre.
 * Aborting clears the source, which cancels the download.
 */
export const loadCrossOriginPhoto: PhotoLoader = (url, signal) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  const aborted = new Promise<never>((_, reject) =>
    signal.addEventListener(
      'abort',
      () => {
        image.src = '';
        reject(signal.reason);
      },
      { once: true },
    ),
  );
  image.src = url;
  return Promise.race([image.decode().then(() => image), aborted]);
};

/**
 * The images of one build's photo pins and flag. MapLibre asks for a pin's image when it lays out
 * its tile; the answer is a framed placeholder of the final size at once, so layout and collision
 * never wait on the network. Only the photo pins MapLibre actually placed have their photo fetched
 * (after each `idle` and `moveend`), and each fades into its frame by a few same-size updates; the
 * flag, one image, is fetched at once. A photo that fails keeps its placeholder and is not asked
 * for again. Built only when a photo host is configured.
 */
export class PhotoPins {
  /** The build's spots, by id. */
  private readonly spots: ReadonlyMap<string, SpotListFeature>;
  /** Image ids whose photo is drawn or fading in. */
  private readonly withPhoto = new Set<string>();
  /** Image ids whose photo is being fetched. */
  private readonly pending = new Set<string>();
  /** Image ids whose photo failed to load. */
  private readonly failed = new Set<string>();
  /** The animation frames fades are waiting on. */
  private readonly frames = new Set<number>();
  /** Aborts every pending fetch, and every fade, on dispose. */
  private readonly loads = new AbortController();
  /** Fetches the placed pins' photos once the map settles. */
  private readonly onSettled = () => this.fetchPlacedPhotos();

  /**
   * @param map the build's map, before its spot layers are added
   * @param collection the build's spots, for each pin's cover photo and status
   * @param photoBaseUrl `SpotmapBackend.photoBaseUrl`, non-empty
   * @param loadPhoto fetches one photo; specs pass a fake
   */
  constructor(
    private readonly map: MapLibreMap,
    collection: SpotListCollection,
    private readonly photoBaseUrl: string,
    private readonly loadPhoto: PhotoLoader = loadCrossOriginPhoto,
  ) {
    this.spots = new Map(
      collection.features.map((feature) => [feature.properties.id, feature]),
    );
  }

  /** Answers MapLibre's missing images and starts fetching placed photos as the map settles. */
  install(): void {
    this.map.setMissingStyleImageResolver((imageId) => this.resolve(imageId));
    this.map.on('idle', this.onSettled);
    this.map.on('moveend', this.onSettled);
  }

  /** Cancels every fetch and fade and stops listening; the images go with the map. */
  dispose(): void {
    this.loads.abort();
    this.map.off('idle', this.onSettled);
    this.map.off('moveend', this.onSettled);
    for (const frame of this.frames) {
      cancelAnimationFrame(frame);
    }
    this.frames.clear();
  }

  /** Adds a placeholder for a pin image MapLibre needs; the flag's photo is fetched straight away. */
  private resolve(imageId: string): void {
    const pin = this.pinFor(imageId);
    if (!pin || this.map.hasImage(imageId)) {
      return;
    }
    this.map.addImage(imageId, drawPinImage(null, pin.style), {
      pixelRatio: PIN_PIXEL_RATIO,
    });
    if (pin.style === 'flag') {
      this.fetch(imageId, pin);
    }
  }

  /** The spot and style an image id stands for, or `null` for an image this does not draw. */
  private pinFor(
    imageId: string,
  ): { spot: SpotListFeature; style: PinStyle } | null {
    const flag = imageId.startsWith(FLAG_IMAGE_PREFIX);
    if (!flag && !imageId.startsWith(PHOTO_PIN_IMAGE_PREFIX)) {
      return null;
    }
    const spot = this.spots.get(
      imageId.slice((flag ? FLAG_IMAGE_PREFIX : PHOTO_PIN_IMAGE_PREFIX).length),
    );
    if (!spot?.properties.cover) {
      return null;
    }
    const style = flag
      ? 'flag'
      : spot.properties.status === 'demolished'
        ? 'demolished'
        : 'active';
    return { spot, style };
  }

  /** Fetches the photos of the photo pins MapLibre placed on screen. */
  private fetchPlacedPhotos(): void {
    for (const feature of this.map.queryRenderedFeatures({
      layers: [SPOT_PHOTO_LAYER_ID],
    })) {
      const id = feature.properties?.['id'];
      if (typeof id !== 'string') {
        continue;
      }
      const imageId = PHOTO_PIN_IMAGE_PREFIX + id;
      const pin = this.pinFor(imageId);
      if (pin) {
        this.fetch(imageId, pin);
      }
    }
  }

  /** Fetches one image's photo and fades it in, unless it has, is being, or failed to be fetched. */
  private fetch(
    imageId: string,
    pin: { spot: SpotListFeature; style: PinStyle },
  ): void {
    const cover = pin.spot.properties.cover;
    if (
      !cover ||
      this.loads.signal.aborted ||
      this.withPhoto.has(imageId) ||
      this.pending.has(imageId) ||
      this.failed.has(imageId)
    ) {
      return;
    }
    this.pending.add(imageId);
    this.loadPhoto(
      photoUrl(this.photoBaseUrl, cover, 'thumb'),
      this.loads.signal,
    ).then(
      (photo) => {
        this.pending.delete(imageId);
        if (!this.loads.signal.aborted) {
          this.withPhoto.add(imageId);
          this.fadeIn(imageId, photo, pin.style);
        }
      },
      () => {
        this.pending.delete(imageId);
        this.failed.add(imageId);
      },
    );
  }

  /**
   * Fades `photo` into its placeholder over {@link PHOTO_FADE_MS}, one same-size `updateImage` a
   * frame. A fade is a change in place, so reduced motion keeps it.
   */
  private fadeIn(imageId: string, photo: PinPhoto, style: PinStyle): void {
    let startedAt: number | undefined;
    let frame: number;
    const step = (now: number) => {
      this.frames.delete(frame);
      if (this.loads.signal.aborted || !this.map.hasImage(imageId)) {
        return;
      }
      startedAt ??= now;
      const progress = Math.min((now - startedAt) / PHOTO_FADE_MS, 1);
      this.map.updateImage(imageId, drawPinImage(photo, style, progress));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
        this.frames.add(frame);
      }
    };
    frame = requestAnimationFrame(step);
    this.frames.add(frame);
  }
}
