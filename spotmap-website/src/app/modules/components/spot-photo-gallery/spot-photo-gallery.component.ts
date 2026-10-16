import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { AsciiRainComponent } from '../ascii-rain/ascii-rain.component';

/** Minimum horizontal travel that counts as a swipe rather than a tap, in CSS pixels. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * A spot's photos as one 4:3 slide at a time, with arrows, an `[n/N]` counter and swipe on
 * touch. `photos` are image URLs (the popup builds them from photo keys). While a slide's photo
 * loads, the slide shows a small block of ASCII rain, and the photo crossfades in once it has
 * loaded; a photo already in the browser's cache shows at once, whichever slide it is. A photo that fails to load — the
 * photo host paused, or the object gone — shows an in-style placeholder in its slide; the others
 * and the navigation keep working. The panel is 4:3 unless the popup fits it to a height through
 * `--spot-popup-gallery-height`.
 */
@Component({
  selector: 'app-spot-photo-gallery',
  imports: [AsciiRainComponent],
  templateUrl: './spot-photo-gallery.component.html',
  styleUrl: './spot-photo-gallery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPhotoGalleryComponent {
  /** Image URLs in gallery order. */
  photos = input.required<string[]>();
  /** The spot's name, for the images' alt text. */
  spotName = input.required<string>();

  protected readonly index = signal(0);
  protected readonly count = computed(() => this.photos().length);
  protected readonly current = computed(() => this.photos()[this.index()]);
  protected readonly hasMany = computed(() => this.count() > 1);
  protected readonly counter = computed(
    () => `[${this.index() + 1}/${this.count()}]`,
  );
  protected readonly altText = computed(
    () => `${this.spotName()}, photo ${this.index() + 1} of ${this.count()}`,
  );

  /** The URLs whose image failed to load; their slides show the placeholder. */
  private readonly failed = signal<ReadonlySet<string>>(new Set());

  /** True while the slide on screen is a photo that failed to load. */
  protected readonly currentFailed = computed(() =>
    this.failed().has(this.current()),
  );

  /** What a screen reader hears for a failed slide. */
  protected readonly placeholderLabel = computed(
    () => `${this.altText()}, did not load`,
  );

  /** The URLs whose image has loaded; their slides show the photo. */
  private readonly loaded = signal<ReadonlySet<string>>(new Set());

  /** True once the slide on screen has its image; until then it shows the rain. */
  protected readonly currentLoaded = computed(() =>
    this.loaded().has(this.current()),
  );

  /**
   * The URLs whose image was already complete when its slide rendered; those slides show their
   * photo without a crossfade. Per slide, so a photo that loads later still crossfades in.
   */
  private readonly instantUrls = signal<ReadonlySet<string>>(new Set());

  /** True while the slide on screen was complete on render and so shows without a crossfade. */
  protected readonly currentInstant = computed(() =>
    this.instantUrls().has(this.current()),
  );

  /** The slide's image element, absent while the slide shows the failure placeholder. */
  private readonly photo = viewChild<ElementRef<HTMLImageElement>>('photo');

  private touchStartX: number | null = null;

  constructor() {
    // A cached image may have finished before the `(load)` listener could hear it, so after each
    // render the element itself is asked whether it is already complete.
    afterRenderEffect(() => {
      this.current();
      const image = this.photo()?.nativeElement;
      const src = image?.getAttribute('src');
      if (
        image &&
        src &&
        image.complete &&
        image.naturalWidth > 0 &&
        !this.loaded().has(src)
      ) {
        this.instantUrls.update((urls) => new Set(urls).add(src));
        this.markLoaded(src);
      }
    });
  }

  /** Shows the next photo, wrapping to the first. */
  next(): void {
    this.index.update((i) => (i + 1) % this.count());
  }

  /** Shows the previous photo, wrapping to the last. */
  previous(): void {
    this.index.update((i) => (i - 1 + this.count()) % this.count());
  }

  /**
   * Marks the URL the failing image was showing, read from the element rather than from
   * `index`, so a late error from a slide already swiped past fails that slide, not this one.
   */
  protected onImageError(event: Event): void {
    const src = (event.target as HTMLImageElement).getAttribute('src');
    if (src !== null) {
      this.failed.update((failed) => new Set(failed).add(src));
    }
  }

  /** Marks the URL the image element was showing, for the same reason as {@link onImageError}. */
  protected onImageLoad(event: Event): void {
    const src = (event.target as HTMLImageElement).getAttribute('src');
    if (src !== null) {
      this.markLoaded(src);
    }
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null || !this.hasMany()) {
      return;
    }
    const delta =
      (event.changedTouches[0]?.clientX ?? this.touchStartX) - this.touchStartX;
    this.touchStartX = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) {
      return;
    }
    delta < 0 ? this.next() : this.previous();
  }

  /** Remembers a loaded URL, so swiping back to its slide never shows the rain again. */
  private markLoaded(src: string): void {
    this.loaded.update((loaded) => new Set(loaded).add(src));
  }
}
