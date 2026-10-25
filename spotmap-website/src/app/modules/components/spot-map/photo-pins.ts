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
  PIN_IMAGE_LIFT_PX,
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

/** How far above its pin the selection flag reaches, in px: the image's lift plus its height. */
export const FLAG_REACH_PX = PIN_IMAGE_LIFT_PX + PIN_IMAGE_HEIGHT;

/**
 * Whether `point` lies on the opaque body of the pin image standing on the pin at `pin` — the
 * framed photo — as opposed to the stem band at the foot of the image, which MapLibre counts as
 * part of it although the 60 x 8 px around the stem is transparent. A layer query reports the
 * whole image box as hit, so this is what tells a pointer on the photo from one on a dot showing
 * through the band. Both are screen points in px; the frame's rounded corners count as body.
 */
export function isOnPinImageBody(
  pin: { x: number; y: number },
  point: { x: number; y: number },
): boolean {
  const bodyBottom = pin.y - PIN_IMAGE_LIFT_PX - STEM_PX;
  const bodyTop = bodyBottom - (PIN_IMAGE_HEIGHT - STEM_PX);
  return (
    Math.abs(point.x - pin.x) <= PIN_IMAGE_WIDTH / 2 &&
    point.y >= bodyTop &&
    point.y <= bodyBottom
  );
}

/** How many photos fade into their frames at once; the rest wait their turn. */
export const MAX_CONCURRENT_FADES = 8;

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

/** The one canvas every pin image is drawn on; made on first use. */
let scratch:
  { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | undefined;

/**
 * The shared pin-image canvas. Pins are drawn dozens at a time while a city's photos arrive, so
 * one canvas is kept instead of one per image; `willReadFrequently` keeps it in CPU memory, where
 * each `getImageData` read is cheap.
 */
function scratchCanvas(): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  if (!scratch) {
    const canvas = document.createElement('canvas');
    canvas.width = PIN_IMAGE_WIDTH * PIN_PIXEL_RATIO;
    canvas.height = PIN_IMAGE_HEIGHT * PIN_PIXEL_RATIO;
    scratch = {
      canvas,
      context: canvas.getContext('2d', { willReadFrequently: true })!,
    };
  }
  return scratch;
}

/** The empty frame of each style, drawn once: MapLibre copies an image it is given. */
const placeholders = new Map<PinStyle, ImageData>();

/** The frame a pin shows until its photo arrives, shared by every pin of `style`. */
function placeholderImage(style: PinStyle): ImageData {
  let image = placeholders.get(style);
  if (!image) {
    image = drawPinImage(null, style);
    placeholders.set(style, image);
  }
  return image;
}

/**
 * A photo cover-cropped to its box at the pin's pixel ratio. A pin image only ever shows this much
 * of a photo, so the 640 px original can be dropped once this is made.
 */
function photoTile(photo: PinPhoto): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = PHOTO_WIDTH * PIN_PIXEL_RATIO;
  tile.height = PHOTO_HEIGHT * PIN_PIXEL_RATIO;
  drawCover(tile.getContext('2d')!, photo, {
    x: 0,
    y: 0,
    width: tile.width,
    height: tile.height,
  });
  return tile;
}

/**
 * Draws one pin image: the photo (or, before it arrives, the `surface` fill) cover-cropped into a
 * 4 px-rounded frame on a stem — `phosphor-deep` for a standing spot, `phosphor-dim` with the photo
 * dimmed for a demolished one, a 2 px `amber` frame for the flag. `photoAlpha` fades the photo in.
 * Every call draws on one shared canvas, so the result is a copy that is the caller's to keep.
 */
export function drawPinImage(
  photo: PinPhoto | null,
  style: PinStyle,
  photoAlpha = 1,
): ImageData {
  const { canvas, context } = scratchCanvas();
  context.setTransform(PIN_PIXEL_RATIO, 0, 0, PIN_PIXEL_RATIO, 0, 0);
  context.clearRect(0, 0, PIN_IMAGE_WIDTH, PIN_IMAGE_HEIGHT);

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
 * Aborting before the photo has loaded clears the source, which cancels the download; once it has
 * loaded the abort is no longer listened for, so the image is not kept alive by the signal.
 */
export const loadCrossOriginPhoto: PhotoLoader = (url, signal) =>
  new Promise<PinPhoto>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    const onAbort = () => {
      image.src = '';
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    image.src = url;
    image.decode().then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve(image);
      },
      (reason) => {
        signal.removeEventListener('abort', onAbort);
        reject(reason);
      },
    );
  });

/** How long the map must stop rendering before the pins it placed have their photos fetched. */
const PLACED_FETCH_QUIET_MS = 120;

/** One photo fading into its pin image. */
interface Fade {
  readonly imageId: string;
  readonly tile: HTMLCanvasElement;
  readonly style: PinStyle;
  /** The frame time the fade began at, set by its first frame. */
  startedAt?: number;
}

/**
 * The images of one build's photo pins and flag. MapLibre asks for a pin's image when it lays out
 * its tile; the answer is a framed placeholder of the final size at once, so layout and collision
 * never wait on the network. Only the photo pins MapLibre actually placed have their photo fetched
 * — once the map has rendered and gone quiet, and after each `moveend` and `idle` — and each fades
 * into its frame by a few same-size updates, a handful at a time, all driven by one animation
 * frame. A photo is fetched once per cover and kept as a small cropped tile, so the flag of a
 * spot whose photo pin already shows its photo is drawn complete, with nothing fetched. A photo
 * that fails keeps its placeholder and is not asked for again. Built only when a photo host is
 * configured.
 */
export class PhotoPins {
  /** The build's spots, by id. */
  private readonly spots: ReadonlyMap<string, SpotListFeature>;
  /** Image ids whose photo is drawn or fading in. */
  private readonly withPhoto = new Set<string>();
  /** Image ids waiting on their cover's photo. */
  private readonly pending = new Set<string>();
  /** Covers whose photo failed to load. */
  private readonly failed = new Set<string>();
  /** The cropped photos fetched so far, by cover. */
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  /** The fetches in flight, by cover, so two images of one cover share a request. */
  private readonly loading = new Map<string, Promise<HTMLCanvasElement>>();
  /** The fades running, at most {@link MAX_CONCURRENT_FADES}. */
  private readonly fading: Fade[] = [];
  /** The fades waiting for a free place. */
  private readonly waiting: Fade[] = [];
  /** The animation frame the fades are waiting on, if any. */
  private frame?: number;
  /** The timer that fetches placed photos once rendering has gone quiet, if one is running. */
  private quietTimer?: ReturnType<typeof setTimeout>;
  /** Aborts every pending fetch, and every fade, on dispose. */
  private readonly loads = new AbortController();
  /** Fetches the placed pins' photos once the map settles. */
  private readonly onSettled = () => this.fetchPlacedPhotos();
  /** Restarts the quiet wait on every rendered frame. */
  private readonly onRender = () => {
    clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(this.onSettled, PLACED_FETCH_QUIET_MS);
  };

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

  /**
   * Answers MapLibre's missing images and starts fetching placed photos as the map settles. Not
   * only on `idle`: that waits for the relief tiles too, which would leave the pins blank frames.
   */
  install(): void {
    this.map.setMissingStyleImageResolver((imageId) => this.resolve(imageId));
    this.map.on('render', this.onRender);
    this.map.on('idle', this.onSettled);
    this.map.on('moveend', this.onSettled);
  }

  /** Cancels every fetch, fade and timer and stops listening; the images go with the map. */
  dispose(): void {
    this.loads.abort();
    this.map.off('render', this.onRender);
    this.map.off('idle', this.onSettled);
    this.map.off('moveend', this.onSettled);
    clearTimeout(this.quietTimer);
    this.quietTimer = undefined;
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    this.fading.length = 0;
    this.waiting.length = 0;
  }

  /**
   * Adds the image MapLibre needs: a flag whose photo is already known is drawn complete; any
   * other gets a shared placeholder, and the flag's photo is fetched straight away.
   */
  private resolve(imageId: string): void {
    const pin = this.pinFor(imageId);
    if (!pin || this.map.hasImage(imageId)) {
      return;
    }
    const tile = this.tiles.get(pin.spot.properties.cover ?? '');
    if (pin.style === 'flag' && tile) {
      this.withPhoto.add(imageId);
      this.map.addImage(imageId, drawPinImage(tile, pin.style), {
        pixelRatio: PIN_PIXEL_RATIO,
      });
      return;
    }
    this.map.addImage(imageId, placeholderImage(pin.style), {
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
    clearTimeout(this.quietTimer);
    this.quietTimer = undefined;
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

  /** Brings one image's photo in and fades it, unless it has, is being, or failed to be fetched. */
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
      this.failed.has(cover)
    ) {
      return;
    }
    this.pending.add(imageId);
    this.tileOf(cover).then(
      (tile) => {
        this.pending.delete(imageId);
        if (!this.loads.signal.aborted) {
          this.withPhoto.add(imageId);
          this.startFade({ imageId, tile, style: pin.style });
        }
      },
      () => this.pending.delete(imageId),
    );
  }

  /** The cropped photo of `cover`: the one fetched earlier, or one fetch shared by every asker. */
  private tileOf(cover: string): Promise<HTMLCanvasElement> {
    const known = this.tiles.get(cover);
    if (known) {
      return Promise.resolve(known);
    }
    let inFlight = this.loading.get(cover);
    if (!inFlight) {
      inFlight = this.loadPhoto(
        photoUrl(this.photoBaseUrl, cover, 'thumb'),
        this.loads.signal,
      )
        .then((photo) => {
          const tile = photoTile(photo);
          this.tiles.set(cover, tile);
          return tile;
        })
        .catch((error: unknown) => {
          this.failed.add(cover);
          throw error;
        })
        .finally(() => this.loading.delete(cover));
      this.loading.set(cover, inFlight);
    }
    return inFlight;
  }

  /** Starts a fade now, or when one of the {@link MAX_CONCURRENT_FADES} places frees up. */
  private startFade(fade: Fade): void {
    (this.fading.length < MAX_CONCURRENT_FADES
      ? this.fading
      : this.waiting
    ).push(fade);
    this.frame ??= requestAnimationFrame(this.step);
  }

  /**
   * One frame of every running fade, over {@link PHOTO_FADE_MS}, one same-size `updateImage` each.
   * A fade is a change in place, so reduced motion keeps it.
   */
  private readonly step = (now: number): void => {
    this.frame = undefined;
    if (this.loads.signal.aborted) {
      return;
    }
    for (const fade of [...this.fading]) {
      if (!this.map.hasImage(fade.imageId)) {
        this.fading.splice(this.fading.indexOf(fade), 1);
        continue;
      }
      fade.startedAt ??= now;
      const progress = Math.min((now - fade.startedAt) / PHOTO_FADE_MS, 1);
      this.map.updateImage(
        fade.imageId,
        drawPinImage(fade.tile, fade.style, progress),
      );
      if (progress === 1) {
        this.fading.splice(this.fading.indexOf(fade), 1);
      }
    }
    while (this.fading.length < MAX_CONCURRENT_FADES && this.waiting.length) {
      this.fading.push(this.waiting.shift()!);
    }
    if (this.fading.length) {
      this.frame = requestAnimationFrame(this.step);
    }
  };
}
