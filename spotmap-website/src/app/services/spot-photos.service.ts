import { inject, Injectable } from '@angular/core';
import { SPOTMAP_BACKEND } from './spotmap-backend';

/** The bucket's rendition folders: the 1400 px original and the 640 px thumbnail. Full first, the order uploads and deletes run in. */
export const PHOTO_RENDITIONS = ['full', 'thumb'] as const;

/** One of a photo's renditions in the bucket. */
export type PhotoRendition = (typeof PHOTO_RENDITIONS)[number];

/** A list of photos' URLs: thumbs and fulls hold the same photos in the same order. */
export interface PhotoUrlSet {
  readonly thumbs: readonly string[];
  readonly fulls: readonly string[];
}

/**
 * The one owner of photo URLs: how a key becomes a URL, and what happens without a photo host. The
 * only reader of `SpotmapBackend.photoBaseUrl`.
 */
@Injectable({ providedIn: 'root' })
export class SpotPhotos {
  private readonly baseUrl = inject(SPOTMAP_BACKEND).photoBaseUrl;

  /** Whether a photo host is configured. */
  readonly enabled = this.baseUrl !== '';

  /** The URL of a photo's thumbnail; only meaningful when {@link enabled}. */
  thumb(key: string): string {
    return this.url(key, 'thumb');
  }

  /** The URL of a photo's full-size rendition; only meaningful when {@link enabled}. */
  full(key: string): string {
    return this.url(key, 'full');
  }

  /** The thumbnail of a spot's cover, or null without a spot, a cover or a photo host. */
  coverThumb(
    spot: { readonly cover: string | null } | null | undefined,
  ): string | null {
    const cover = spot?.cover;
    return cover && this.enabled ? this.thumb(cover) : null;
  }

  /** The URLs of `keys`, thumbs and fulls in step with them; both empty without a photo host. */
  set(keys: readonly string[]): PhotoUrlSet {
    return this.enabled
      ? {
          thumbs: keys.map((key) => this.thumb(key)),
          fulls: keys.map((key) => this.full(key)),
        }
      : { thumbs: [], fulls: [] };
  }

  private url(key: string, rendition: PhotoRendition): string {
    return `${this.baseUrl}/${rendition}/${key}`;
  }
}
