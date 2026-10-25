import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { AsciiRainComponent } from '../ascii-rain/ascii-rain.component';

/** Minimum horizontal travel that counts as a swipe rather than a tap, in CSS pixels. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * A spot's photos as one 4:3 slide at a time, with ‹ › plates and swipe on touch: the photo
 * viewer's stage. `photos` are thumbnail URLs, which the rail has usually loaded already, so a
 * slide shows its thumb at once. Its full-size photo, when `fullPhotos` gives one, crossfades in
 * over it once it has loaded. A full-size photo that fails leaves the thumb. A slide neither has
 * loaded shows a small block of ASCII rain. A broken thumb with no full-size photo shows an
 * in-style placeholder, and the others and the navigation keep working. A photo already in the
 * browser's cache shows at once. The slide is two-way bindable as `[(index)]`. The plates can be
 * faded out and made inert through `controls`, so a host can hold them back while it animates. The
 * panel is 4:3 at the whole width its host gives it.
 */
@Component({
  selector: 'app-spot-photo-gallery',
  imports: [AsciiRainComponent, PointerBloomDirective],
  templateUrl: './spot-photo-gallery.component.html',
  styleUrl: './spot-photo-gallery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPhotoGalleryComponent {
  /** Thumbnail URLs in gallery order: what each slide shows at once. */
  readonly photos = input.required<readonly string[]>();
  /**
   * Full-size URLs in the same order, each crossfading in over its thumb once it has loaded; `null`
   * shows thumbs only.
   */
  readonly fullPhotos = input<readonly string[] | null>(null);
  /** The spot's name, for the images' alt text. */
  readonly spotName = input.required<string>();
  /** Whether the ‹ › plates show; `false` fades them out and makes them inert. */
  readonly controls = input(true);

  /**
   * The slide on screen, two-way bindable. Held inside the photo list: when a shorter list
   * arrives, an index past its end moves onto the last photo, and the binding hears it.
   */
  readonly index = model(0);
  /** How many photos the gallery has. */
  protected readonly count = computed(() => this.photos().length);
  /** {@link index} held inside the photo list; every slide-dependent value reads this. */
  private readonly slide = computed(() =>
    Math.min(Math.max(this.index(), 0), Math.max(this.count() - 1, 0)),
  );
  /** The thumbnail URL of the slide on screen. */
  protected readonly current = computed(() => this.photos()[this.slide()]);
  /** The full-size URL of the slide on screen, or `null` when the gallery has thumbs only. */
  protected readonly currentFull = computed(
    () => this.fullPhotos()?.[this.slide()] ?? null,
  );
  /** Whether there is more than one photo, so the plates and swipe apply. */
  protected readonly hasMany = computed(() => this.count() > 1);
  /** The alt text of the photo on screen. */
  protected readonly altText = computed(
    () => `${this.spotName()}, photo ${this.slide() + 1} of ${this.count()}`,
  );

  /** The URLs whose image failed to load. */
  private readonly failed = signal<ReadonlySet<string>>(new Set());
  /** The URLs whose image has loaded. */
  private readonly loaded = signal<ReadonlySet<string>>(new Set());
  /**
   * The URLs whose image was already complete when its slide rendered; those show without a
   * crossfade. Per URL, so a photo that loads later still crossfades in.
   */
  private readonly instantUrls = signal<ReadonlySet<string>>(new Set());

  /** True once the slide's thumb has loaded. */
  protected readonly thumbLoaded = computed(() =>
    this.loaded().has(this.current()),
  );
  /** True once the slide's full-size photo has loaded; it then covers the thumb. */
  protected readonly fullLoaded = computed(() => {
    const full = this.currentFull();
    return full !== null && this.loaded().has(full);
  });
  /** Whether the slide's full-size photo is drawn at all: there is one and it has not failed. */
  protected readonly showsFull = computed(() => {
    const full = this.currentFull();
    return full !== null && !this.failed().has(full);
  });
  /** True once either of the slide's photos has loaded; until then it shows the rain. */
  protected readonly currentLoaded = computed(
    () => this.thumbLoaded() || this.fullLoaded(),
  );
  /** True while the slide's thumb is broken and no full-size photo has loaded over it. */
  protected readonly currentFailed = computed(
    () => this.failed().has(this.current()) && !this.fullLoaded(),
  );
  /** What a screen reader hears for a failed slide. */
  protected readonly placeholderLabel = computed(
    () => `${this.altText()}, did not load`,
  );
  /** True while the slide's thumb was complete on render and so shows without a crossfade. */
  protected readonly currentInstant = computed(() =>
    this.instantUrls().has(this.current()),
  );
  /** True while the slide's full-size photo was complete on render and so shows without a crossfade. */
  protected readonly fullInstant = computed(() => {
    const full = this.currentFull();
    return full !== null && this.instantUrls().has(full);
  });

  /** The slide's thumb element, absent while the slide shows the failure placeholder. */
  private readonly photo = viewChild<ElementRef<HTMLImageElement>>('photo');
  /** The slide's full-size element, absent when there is none or it failed. */
  private readonly full = viewChild<ElementRef<HTMLImageElement>>('full');

  /** Where a touch began, in px, until it ends. */
  private touchStartX: number | null = null;

  constructor() {
    // An index the photo list no longer reaches is written back as the slide actually shown, so
    // a two-way binding never holds a photo that is not there.
    effect(() => {
      const slide = this.slide();
      if (slide !== untracked(this.index)) {
        this.index.set(slide);
      }
    });

    // A cached image may have finished before the `(load)` listener could hear it, so after each
    // render both of the slide's elements are asked whether they are already complete.
    afterRenderEffect(() => {
      this.current();
      this.currentFull();
      this.noteComplete(this.photo()?.nativeElement);
      this.noteComplete(this.full()?.nativeElement);
    });
  }

  /** Shows the next photo, wrapping to the first. */
  next(): void {
    this.index.set((this.slide() + 1) % this.count());
  }

  /** Shows the previous photo, wrapping to the last. */
  previous(): void {
    this.index.set((this.slide() - 1 + this.count()) % this.count());
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

  /** Remembers where a touch began. */
  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  /** Turns a horizontal touch past the swipe threshold into a step. */
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

  /** Marks an image that was complete when it rendered as loaded, and as shown without a fade. */
  private noteComplete(image: HTMLImageElement | undefined): void {
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
  }

  /** Remembers a loaded URL, so swiping back to its slide never shows the rain again. */
  private markLoaded(src: string): void {
    this.loaded.update((loaded) => new Set(loaded).add(src));
  }
}
