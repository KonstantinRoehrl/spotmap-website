import { DOCUMENT, inject, Injectable } from '@angular/core';
import type { LngLat } from '../../../models/admin/admin-spot';
import { GPS_READER } from './exif-gps';
import { contentHash8 } from './hashing';
import { PHOTO_DECODER } from './photo-decode';
import {
  FULL_RENDITION,
  fitWithin,
  MAX_OBJECT_BYTES,
  PhotoPipelineError,
  Rendition,
  THUMB_RENDITION,
} from './renditions';
import { WEBP_ENCODER } from './webp-encode';

/**
 * One picked photo, ready to upload: two metadata-free WebP renditions and their content name.
 * The original file is not part of it, so the file and its EXIF never leave the browser (QC11).
 */
export interface ProcessedPhoto {
  /** The picked file's name, shown in the processing list; never uploaded. */
  sourceName: string;
  /**
   * The EXIF GPS position, used only as the satellite picker's first guess, or `null`. It is held
   * in memory only, never uploaded, logged or stored (QC11).
   */
  gps: LngLat | null;
  /** The full-size WebP: long edge ≤ 1400 px, quality 72, no metadata. */
  full: Blob;
  /** The thumbnail WebP: long edge ≤ 640 px, quality 70, no metadata. */
  thumb: Blob;
  /** The first 8 hex of the SHA-256 of {@link full}'s bytes; goes into `photoKey()`. */
  hash8: string;
  /** {@link full}'s width in pixels, after orientation. */
  width: number;
  /** {@link full}'s height in pixels, after orientation. */
  height: number;
}

/**
 * Turns a picked photo into the two renditions the bucket serves, entirely in the browser. It
 * reads the GPS guess and decodes upright pixels in parallel. It draws the full rendition from
 * the decoded image and the thumbnail from the full rendition's pixels, which gives the same sizes
 * as tools/extract-spots. It encodes both through {@link WEBP_ENCODER} and names the photo by its
 * full rendition's content hash. A canvas carries no metadata, which is how EXIF is stripped. Every
 * failure rejects with a {@link PhotoPipelineError}.
 */
@Injectable({ providedIn: 'root' })
export class PhotoPipeline {
  private readonly readGps = inject(GPS_READER);
  private readonly decode = inject(PHOTO_DECODER);
  private readonly encode = inject(WEBP_ENCODER);
  private readonly document = inject(DOCUMENT);

  /**
   * Processes one photo.
   *
   * @param file a picked JPEG, HEIC, PNG or WebP
   * @returns the renditions, their content hash and the in-memory GPS guess
   * @throws {PhotoPipelineError} `unsupported-format` or `decode-failed` from decoding,
   *   `encode-failed` or `too-large` from encoding
   */
  async process(file: File): Promise<ProcessedPhoto> {
    const [gps, bitmap] = await Promise.all([
      this.readGps(file),
      this.decode(file),
    ]);
    let fullSurface: CanvasRenderingContext2D | undefined;
    let thumbSurface: CanvasRenderingContext2D | undefined;
    try {
      fullSurface = this.draw(
        bitmap,
        fitWithin(bitmap.width, bitmap.height, FULL_RENDITION.longEdgePx),
        file.name,
      );
      const { width, height } = fullSurface.canvas;
      thumbSurface = this.draw(
        fullSurface.canvas,
        fitWithin(width, height, THUMB_RENDITION.longEdgePx),
        file.name,
      );
      const full = await this.encodeRendition(
        fullSurface,
        FULL_RENDITION,
        file.name,
      );
      const thumb = await this.encodeRendition(
        thumbSurface,
        THUMB_RENDITION,
        file.name,
      );
      const hash8 = contentHash8(new Uint8Array(await full.arrayBuffer()));
      return { sourceName: file.name, gps, full, thumb, hash8, width, height };
    } finally {
      bitmap.close();
      // Safari keeps canvas memory until the canvas shrinks; release both at once.
      for (const surface of [fullSurface, thumbSurface]) {
        if (surface) {
          surface.canvas.width = 0;
          surface.canvas.height = 0;
        }
      }
    }
  }

  /**
   * Draws a source scaled to `size` on a fresh canvas, with the browser's best smoothing.
   *
   * @returns the canvas's 2D context; `context.canvas` is the drawn canvas
   */
  private draw(
    source: CanvasImageSource,
    size: { width: number; height: number },
    fileName: string,
  ): CanvasRenderingContext2D {
    const canvas = this.document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new PhotoPipelineError(
        'encode-failed',
        `${fileName} could not be drawn: the browser has no drawing surface left. Close other tabs and retry.`,
      );
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, size.width, size.height);
    return context;
  }

  /**
   * Encodes a drawn rendition and checks that the result is WebP within the bucket's size limit.
   *
   * @throws {PhotoPipelineError} `encode-failed` when the encoder rejects or returns another
   *   type; `too-large` when the WebP is over {@link MAX_OBJECT_BYTES}
   */
  private async encodeRendition(
    surface: CanvasRenderingContext2D,
    rendition: Rendition,
    fileName: string,
  ): Promise<Blob> {
    const { width, height } = surface.canvas;
    let blob: Blob;
    try {
      blob = await this.encode(
        surface.getImageData(0, 0, width, height),
        rendition.quality,
      );
    } catch (error) {
      throw new PhotoPipelineError(
        'encode-failed',
        `${fileName} could not be converted to WebP. Retry; if it keeps failing, export the photo as JPEG first.`,
        { cause: error },
      );
    }
    if (blob.type !== 'image/webp') {
      throw new PhotoPipelineError(
        'encode-failed',
        `${fileName} came out as ${blob.type || 'an unknown type'} instead of WebP. Retry in another browser.`,
      );
    }
    if (blob.size > MAX_OBJECT_BYTES) {
      throw new PhotoPipelineError(
        'too-large',
        `${fileName} is ${(blob.size / 1_048_576).toFixed(1)} MB as WebP, over the 2 MB the photo store accepts. Crop or shrink it and retry.`,
      );
    }
    return blob;
  }
}
