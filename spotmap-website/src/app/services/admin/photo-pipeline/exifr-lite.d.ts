/**
 * Types for exifr's lite ESM build. exifr ships a declaration only for its package root, so the
 * subpath the photo pipeline imports (lite reads JPEG and HEIC, about 44 KB instead of the full
 * build's 74 KB) needs its own. Only the one function the pipeline calls is declared.
 */
declare module 'exifr/dist/lite.esm.mjs' {
  /**
   * Reads the EXIF GPS position of a JPEG or HEIC.
   *
   * @returns decimal degrees, or `undefined` when the file has no GPS block
   * @throws when exifr cannot read the format at all (e.g. WebP, PNG, text)
   */
  export function gps(
    data: Blob | ArrayBuffer | Uint8Array,
  ): Promise<{ latitude: number; longitude: number } | undefined>;
}
