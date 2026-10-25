import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { SpotDetailView } from '../../../models/spots/spot-detail-view';
import { photoUrl, SPOTMAP_BACKEND } from '../../../services/spotmap-backend';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { SpotPhotoGalleryComponent } from '../spot-photo-gallery/spot-photo-gallery.component';
import { directionsUrl } from './directions';
import { SHARE_NAVIGATOR, shareSpot, spotLink } from './share-spot';

/** How long the `> LINK COPIED` (or failure) line stays before it fades out. */
export const SHARE_STATUS_MS = 3000;

/** Numbers each detail's heading, so the region it labels always finds its own. */
let nextHeadingId = 0;

/**
 * One spot, opened from the list, a pin or a link: its photo gallery with a strip of thumbnails,
 * `© all rights reserved`, the name, the notes verbatim, `> DEMOLISHED` for a lost spot, and
 * `> DIRECTIONS` / `> SHARE SPOT`. While the full file loads it shows what the list already knew
 * — the name and the first photo — in the boxes the full content will take, so nothing jumps
 * when it arrives; a file that cannot be loaded keeps those boxes, says so and offers RETRY, so
 * neither the failure nor the retry moves the name. Loading, failed and loaded crossfade in one
 * cell instead of cutting. Without photos or a photo host the detail starts at the name. Opening
 * a spot scrolls its pane to the top and moves focus to its heading, as does a RETRY, which
 * removes the button that held it.
 */
@Component({
  selector: 'app-spot-detail',
  imports: [PointerBloomDirective, SpotPhotoGalleryComponent],
  templateUrl: './spot-detail.component.html',
  styleUrl: './spot-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotDetailComponent {
  /** The spot being shown, and how far its file has come. */
  view = input.required<SpotDetailView>();

  /** RETRY was pressed on a file that could not be loaded; the page loads it again. */
  retry = output<void>();

  /** Where photos are served from; empty when no photo host is configured. */
  private readonly photoBaseUrl = inject(SPOTMAP_BACKEND).photoBaseUrl;
  /** The navigator a share goes through; a fake in specs. */
  private readonly shareNavigator = inject(SHARE_NAVIGATOR);
  /** Runs the share line's clear timer outside the zone, see {@link share}. */
  private readonly zone = inject(NgZone);

  /** The heading's id, which labels the region. */
  protected readonly headingId = `spot-detail-heading-${nextHeadingId++}`;

  /** The gallery's slide, bound two-way: the strip drives it and follows the gallery's arrows. */
  protected readonly photoIndex = signal(0);

  /** The share line under the actions, or `null` while there is nothing to say. */
  protected readonly shareStatus = signal<'copied' | 'copy-failed' | null>(
    null,
  );

  /** The component's own element: the pane that scrolls when the detail is taller than its room. */
  private readonly pane =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The spot's heading, which takes focus when a spot opens. */
  private readonly heading =
    viewChild.required<ElementRef<HTMLElement>>('heading');
  /** The photo strip, present only for a loaded spot with two or more photos. */
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  /** The pending timer that clears {@link shareStatus}. */
  private shareStatusTimer?: ReturnType<typeof setTimeout>;

  /** The open spot's id; changes only when another spot opens, not as its file arrives. */
  private readonly spotId = computed(() => this.view().id);

  /** The full file, once it is in. */
  protected readonly spot = computed(() => {
    const view = this.view();
    return view.status === 'loaded' ? view.spot : null;
  });

  /** What the list knew while the file is loading or failed; `null` for a cold link. */
  protected readonly preview = computed(() => {
    const view = this.view();
    return view.status === 'loaded' ? null : view.preview;
  });

  /** The name to show, or `null` while a cold link's file is still loading. */
  protected readonly name = computed(
    () => this.spot()?.name ?? this.preview()?.properties.name ?? null,
  );

  /** Thumbnail URLs of the loaded spot's photos; empty without photos or a photo host. */
  protected readonly thumbnails = computed(() => {
    const spot = this.spot();
    const base = this.photoBaseUrl;
    return spot && base
      ? spot.photos.map((key) => photoUrl(base, key, 'thumb'))
      : [];
  });

  /** The preview's cover thumbnail, shown in the gallery's box while the file loads. */
  protected readonly previewCover = computed(() => {
    const cover = this.preview()?.properties.cover;
    return cover && this.photoBaseUrl
      ? photoUrl(this.photoBaseUrl, cover, 'thumb')
      : null;
  });

  /**
   * Whether a detail whose file is not in holds the gallery's 4:3 box, while it loads and after it
   * failed: when the preview counts photos, or, for a cold link that knows nothing yet, whenever a
   * photo host could serve some. Dropping the box on failure would move the name up, and back
   * down on RETRY.
   */
  protected readonly reservesGallery = computed(() => {
    const view = this.view();
    if (view.status === 'loaded' || !this.photoBaseUrl) {
      return false;
    }
    return view.preview ? view.preview.properties.photoCount > 0 : true;
  });

  /** Whether an unloaded detail also holds the strip's row: the preview counts two or more photos. */
  protected readonly reservesStrip = computed(
    () =>
      this.reservesGallery() &&
      (this.preview()?.properties.photoCount ?? 0) >= 2,
  );

  /** Whether the loaded spot is on the record but no longer stands. */
  protected readonly isDemolished = computed(
    () => this.spot()?.status === 'demolished',
  );

  /** The route to the loaded spot; see {@link directionsUrl}. */
  protected readonly directionsHref = computed(() => {
    const spot = this.spot();
    return spot ? directionsUrl(spot.coordinates) : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearShareStatus());

    // Another spot starts on its first photo, with nothing left over from the last share.
    effect(() => {
      this.spotId();
      untracked(() => {
        this.photoIndex.set(0);
        this.clearShareStatus();
      });
    });

    // Focus moves to the heading once per opened spot, and the pane starts at its top. The heading
    // is one element through loading, loaded and failed, so a file arriving later keeps the focus
    // where it is. A RETRY is the exception: the failed block that holds the focused button goes
    // with it, so focus returns to the heading, the one element every state keeps, and the
    // screen reader reads the name once rather than the changing lines. Focus must not scroll: the
    // sheet may still be growing, and scrolling the heading into view would carry the gallery off
    // the top.
    let focusedId: string | null = null;
    let previousStatus: SpotDetailView['status'] | null = null;
    afterRenderEffect(() => {
      const { id, status } = this.view();
      const retried =
        id === focusedId && previousStatus === 'failed' && status === 'loading';
      previousStatus = status;
      if (id !== focusedId) {
        focusedId = id;
        this.pane.scrollTop = 0;
      } else if (!retried) {
        return;
      }
      this.heading().nativeElement.focus({ preventScroll: true });
    });

    // The current strip photo scrolls into the strip's view as the gallery moves, horizontally
    // only, so the pane around it never scrolls. Positions come from bounding rects: `offsetLeft`
    // measures from the nearest positioned ancestor, which is not the strip.
    let shownIndex = 0;
    afterRenderEffect(() => {
      const index = this.photoIndex();
      const strip = this.strip()?.nativeElement;
      const current = strip?.children.item(index) as HTMLElement | null;
      if (!strip || !current || index === shownIndex) {
        shownIndex = index;
        return;
      }
      shownIndex = index;
      const offsetInStrip =
        current.getBoundingClientRect().left -
        strip.getBoundingClientRect().left +
        strip.scrollLeft;
      strip.scrollTo({
        left: offsetInStrip - (strip.clientWidth - current.offsetWidth) / 2,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    });
  }

  /**
   * Shares the loaded spot's link (see {@link shareSpot}). A copy, or a failed one, is reported in
   * the line under the actions for {@link SHARE_STATUS_MS}; the share sheet speaks for itself.
   * The clear timer runs outside the Angular zone so the waiting line does not keep the app from
   * reporting stable; the signal write still schedules the re-render.
   */
  protected async share(): Promise<void> {
    const spot = this.spot();
    if (!spot) {
      return;
    }
    this.clearShareStatus();
    const outcome = await shareSpot(
      spotLink(spot.id),
      spot.name,
      this.shareNavigator,
    );
    if (outcome !== 'copied' && outcome !== 'copy-failed') {
      return;
    }
    this.shareStatus.set(outcome);
    this.shareStatusTimer = this.zone.runOutsideAngular(() =>
      setTimeout(() => {
        this.shareStatusTimer = undefined;
        this.shareStatus.set(null);
      }, SHARE_STATUS_MS),
    );
  }

  /** Drops the share line and its pending timer. */
  private clearShareStatus(): void {
    if (this.shareStatusTimer !== undefined) {
      clearTimeout(this.shareStatusTimer);
      this.shareStatusTimer = undefined;
    }
    this.shareStatus.set(null);
  }
}
