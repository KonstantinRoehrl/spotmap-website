import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';

/** Minimum horizontal travel that counts as a swipe rather than a tap, in CSS pixels. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * A spot's photos as one 4:3 slide at a time, with arrows, an `[n/N]` counter and swipe on
 * touch. `photos` are image URLs (the popup builds them from photo keys). A photo that fails to
 * load — the photo host paused, or the object gone — shows an in-style placeholder in its slide;
 * the others and the navigation keep working.
 */
@Component({
  selector: 'app-spot-photo-gallery',
  imports: [],
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

  private touchStartX: number | null = null;

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
}
