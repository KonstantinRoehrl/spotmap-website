/*
 * The two WebP renditions every photo the maintainer uploads gets. They are the same ones
 * tools/extract-spots writes (photos.mjs: LONG_EDGE_PX / WEBP_QUALITY for the full file,
 * THUMB_LONG_EDGE_PX / THUMB_WEBP_QUALITY for the thumbnail), so a photo looks the same whichever
 * path brought it. This file also holds the pipeline's size limit and its error type, which every
 * other pipeline file shares.
 */

/** One rendition: the cap on the longer side and the WebP quality it is encoded at. */
export interface Rendition {
  /** The most pixels the longer side may have; an image already inside keeps its size. */
  longEdgePx: number;
  /** WebP quality, 0–100, on the same scale sharp's `webp({ quality })` uses. */
  quality: number;
}

/** The full-size rendition the gallery opens: long edge 1400 px, quality 72. */
export const FULL_RENDITION: Rendition = { longEdgePx: 1400, quality: 72 };

/** The popup's thumbnail: long edge 640 px, quality 70. */
export const THUMB_RENDITION: Rendition = { longEdgePx: 640, quality: 70 };

/**
 * The `spot-photos` bucket's `file_size_limit`, 2 MiB. Storage refuses anything larger, so the
 * pipeline stops before the upload with an error the maintainer can act on.
 */
export const MAX_OBJECT_BYTES = 2_097_152;

/**
 * The size an image gets when it is fitted inside a square of `longEdgePx` without being
 * enlarged. The aspect ratio is kept, the longer side becomes exactly `longEdgePx` and the
 * shorter side is rounded to the nearest pixel (at least 1). This reproduces sharp's
 * `resize({ fit: 'inside', withoutEnlargement: true })`, which the extractor uses.
 *
 * @param width the source width in pixels, after orientation
 * @param height the source height in pixels, after orientation
 * @param longEdgePx the rendition's {@link Rendition.longEdgePx}
 * @returns the output size; the input size when it already fits
 */
export function fitWithin(
  width: number,
  height: number,
  longEdgePx: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= longEdgePx) {
    return { width, height };
  }
  const scale = longEdgePx / longEdge;
  return width >= height
    ? { width: longEdgePx, height: Math.max(1, Math.round(height * scale)) }
    : { width: Math.max(1, Math.round(width * scale)), height: longEdgePx };
}

/**
 * Why a photo could not be processed:
 * - `unsupported-format`: the file is not an image this browser can read;
 * - `decode-failed`: it claims to be an image, but decoding failed (damaged, or HEIC the
 *   fallback decoder could not read);
 * - `encode-failed`: the WebP encode failed or did not produce WebP;
 * - `too-large`: a rendition came out over {@link MAX_OBJECT_BYTES}.
 */
export type PhotoPipelineErrorKind =
  'unsupported-format' | 'decode-failed' | 'encode-failed' | 'too-large';

/**
 * A photo-pipeline failure. The message is written for the maintainer: it names the file and says
 * what to do next. The `kind` lets the UI choose how to show the error.
 */
export class PhotoPipelineError extends Error {
  /**
   * @param kind what went wrong
   * @param message the maintainer-facing explanation
   * @param options `cause` carries the underlying browser or library error for debugging
   */
  constructor(
    readonly kind: PhotoPipelineErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoPipelineError';
  }
}
