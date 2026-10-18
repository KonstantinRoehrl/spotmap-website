import { InjectionToken } from '@angular/core';
import { PhotoPipelineError } from './renditions';

/**
 * Decodes a picked photo into upright pixels: the EXIF orientation is applied, so the renditions
 * need no rotation and carry no orientation tag. Rejects with a {@link PhotoPipelineError} of kind
 * `unsupported-format` or `decode-failed`.
 */
export type PhotoDecoder = (file: File) => Promise<ImageBitmap>;

const HEIC_MIME_TYPE = /^image\/hei[cf](-sequence)?$/i;
const HEIC_EXTENSION = /\.hei[cf]$/i;

/**
 * Whether a file is HEIC/HEIF judged by what the picker reports: the MIME type, or, when the
 * browser reports none (desktop Chrome often does not know HEIC), the extension. It is synchronous
 * on purpose. heic-to's own `isHeic` reads the bytes and would load the 3 MB decoder just to ask.
 *
 * @param file the picked file
 */
export function isHeic(file: File): boolean {
  return HEIC_MIME_TYPE.test(file.type) || HEIC_EXTENSION.test(file.name);
}

/**
 * The real {@link PhotoDecoder}. It decodes with the browser first:
 * `createImageBitmap(…, { imageOrientation: 'from-image' })` applies the EXIF orientation
 * (Chrome 52+, Safari 15+, per MDN) and decodes HEIC natively on Safari 17+ (assumption). When the
 * browser cannot decode a HEIC file, the file goes to heic-to. heic-to is loaded through a dynamic
 * import only in that case, because it is about 3 MB of LGPL-3.0 WebAssembly (QC12). It decodes
 * straight to an `ImageBitmap`, applying the HEIC rotation, with no lossy JPEG step in between.
 *
 * @param file the picked photo
 * @returns the upright image; the caller closes it
 */
export async function decodePhoto(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (nativeError) {
    if (isHeic(file)) {
      return decodeHeic(file);
    }
    if (file.type.startsWith('image/')) {
      throw new PhotoPipelineError(
        'decode-failed',
        `${file.name} could not be read as an image. It may be damaged; export it again and retry.`,
        { cause: nativeError },
      );
    }
    throw new PhotoPipelineError(
      'unsupported-format',
      `${file.name} is not a photo this browser can read. Pick a JPEG, HEIC, PNG or WebP file.`,
      { cause: nativeError },
    );
  }
}

/** Decodes a HEIC file the browser could not read, through the lazily loaded heic-to. */
async function decodeHeic(file: File): Promise<ImageBitmap> {
  try {
    const { heicTo } = await import('heic-to');
    return await heicTo({
      blob: file,
      type: 'bitmap',
      options: { imageOrientation: 'from-image' },
    });
  } catch (error) {
    throw new PhotoPipelineError(
      'decode-failed',
      `${file.name} looks like a HEIC photo but could not be decoded. Export it as JPEG and retry.`,
      { cause: error },
    );
  }
}

/**
 * The decoder {@link PhotoPipeline} uses. It defaults to {@link decodePhoto}; heic-to sits behind
 * a dynamic import, so the default drags no library into a spec bundle. Specs that are not about
 * decoding provide a fake (QC4).
 */
export const PHOTO_DECODER = new InjectionToken<PhotoDecoder>('PHOTO_DECODER', {
  providedIn: 'root',
  factory: () => decodePhoto,
});
