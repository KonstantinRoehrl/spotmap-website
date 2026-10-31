import { signal } from '@angular/core';

/**
 * Which of a photo component's image URLs have loaded, failed, or were already complete when they
 * rendered. Each component creates its own. A URL is always read from the element, never from the
 * component's current slide, so a late event from a slide swiped past marks that slide.
 */
export class ImageLoadTracker {
  private readonly loadedUrls = signal<ReadonlySet<string>>(new Set());
  private readonly failedUrls = signal<ReadonlySet<string>>(new Set());
  private readonly instantUrls = signal<ReadonlySet<string>>(new Set());

  /** The URLs whose image has loaded. */
  readonly loaded = this.loadedUrls.asReadonly();
  /** The URLs whose image failed to load. */
  readonly failed = this.failedUrls.asReadonly();
  /** The URLs whose image was already complete on render, and so shows without a fade. */
  readonly instant = this.instantUrls.asReadonly();

  /** Marks the URL the loaded element was showing. */
  onLoad(event: Event): void {
    const src = (event.target as HTMLImageElement).getAttribute('src');
    if (src !== null) {
      this.markLoaded(src);
    }
  }

  /** Marks the URL the failing element was showing. */
  onError(event: Event): void {
    const src = (event.target as HTMLImageElement).getAttribute('src');
    if (src !== null) {
      this.failedUrls.update((urls) => new Set(urls).add(src));
    }
  }

  /** Remembers a loaded URL, so its photo never shows the rain again. */
  markLoaded(url: string): void {
    this.loadedUrls.update((urls) => new Set(urls).add(url));
  }

  /** Forgets which URLs were instant: a photo stepped to has the one stepped from to fade over. */
  clearInstant(): void {
    this.instantUrls.set(new Set());
  }

  /**
   * Marks an image that finished before its `(load)` listener could hear it as loaded and, when
   * asked, as instant. `loaded` is read last on purpose: reading it first would subscribe a calling
   * `afterRenderEffect` on every run, re-running it on each load and possibly marking a just
   * completed image instant, which would skip its fade.
   */
  noteComplete(
    image: HTMLImageElement | null | undefined,
    options: { instant: boolean },
  ): void {
    const src = image?.getAttribute('src');
    if (
      image &&
      src &&
      image.complete &&
      image.naturalWidth > 0 &&
      !this.loadedUrls().has(src)
    ) {
      if (options.instant) {
        this.instantUrls.update((urls) => new Set(urls).add(src));
      }
      this.markLoaded(src);
    }
  }
}
