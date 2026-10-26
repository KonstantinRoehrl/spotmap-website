import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import type { SpotDetailView } from '../../../models/spots/spot-detail-view';
import { photoUrl, SPOTMAP_BACKEND } from '../../../services/spotmap-backend';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { SpotPhotoRailComponent } from '../spot-photo-rail/spot-photo-rail.component';
import { PHOTO_VIEWER_LOADER } from '../spot-photo-viewer/photo-viewer-loader';
import type { PhotoViewerHandle } from '../spot-photo-viewer/spot-photo-viewer';
import { SpotShareComponent } from '../spot-share/spot-share.component';
import { directionsUrl } from './directions';

/** Numbers each detail's heading, so the region it labels always finds its own. */
let nextHeadingId = 0;

/** How long the photo viewer's prefetch waits for the browser to go idle before it loads anyway. */
const VIEWER_PREFETCH_DEADLINE_MS = 2000;

/** Where the browser cannot report idle time (Safari), the prefetch runs this long after the first render. */
const VIEWER_PREFETCH_FALLBACK_MS = 500;

/**
 * Runs `task` once the browser is idle, or after {@link VIEWER_PREFETCH_FALLBACK_MS} where it has
 * no `requestIdleCallback`. Returns a function that cancels the task if it has not run yet.
 */
function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(task, {
      timeout: VIEWER_PREFETCH_DEADLINE_MS,
    });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, VIEWER_PREFETCH_FALLBACK_MS);
  return () => clearTimeout(handle);
}

/**
 * One spot, opened from the list, a pin or a link, in the panel's 16 px inset: its photo rail with
 * `© all rights reserved` under it, the name and the notes verbatim, `> DEMOLISHED` for a lost
 * spot, then `> DIRECTIONS` and the share control. Groups sit 16 px apart and the items inside a
 * group 8 px apart. A rail photo opens the photo viewer on it; the viewer is its own lazy chunk,
 * fetched once the browser is first idle after the detail renders, so a photo rarely waits. While the full file loads it shows
 * what the list already knew — the name and the first photo, in the box the rail's first frame
 * will take — so nothing jumps when it arrives; a file that cannot be loaded keeps those boxes,
 * says so and offers RETRY, so neither the failure nor the retry moves the name. Loading, failed
 * and loaded crossfade in one cell instead of cutting. Without photos or a photo host the detail
 * starts at the name. Opening a spot scrolls its pane to the top and moves focus to its heading,
 * as does a RETRY, which removes the button that held it.
 */
@Component({
  selector: 'app-spot-detail',
  imports: [PointerBloomDirective, SpotPhotoRailComponent, SpotShareComponent],
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
  /** Loads the photo viewer, which opens a rail photo; see {@link PHOTO_VIEWER_LOADER}. */
  private readonly loadViewer = inject(PHOTO_VIEWER_LOADER);

  /** The heading's id, which labels the region. */
  protected readonly headingId = `spot-detail-heading-${nextHeadingId++}`;

  /** The component's own element: the pane that scrolls when the detail is taller than its room. */
  private readonly pane =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The spot's heading, which takes focus when a spot opens. */
  private readonly heading =
    viewChild.required<ElementRef<HTMLElement>>('heading');
  /** The photo rail, present only for a loaded spot with photos and a photo host. */
  private readonly rail = viewChild(SpotPhotoRailComponent);

  /** The photo viewer this detail opened, until the spot it shows goes or the detail does. */
  private viewerHandle: PhotoViewerHandle | null = null;
  /**
   * Counts the closes of the viewer. A photo open that waits on the viewer's load goes ahead only
   * if no close came in between: no other spot or file, no other photo, and the detail still here.
   */
  private viewerGeneration = 0;

  /** The open spot's id; changes only when another spot opens, not as its file arrives. */
  private readonly spotId = computed(() => this.view().id);

  /** The id of the spot whose file is in, or `null` while it loads or failed. */
  private readonly loadedId = computed(() => {
    const view = this.view();
    return view.status === 'loaded' ? view.id : null;
  });

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

  /** The loaded spot's photo keys; none without photos or a photo host. */
  private readonly photoKeys = computed(() => {
    const spot = this.spot();
    return spot && this.photoBaseUrl ? spot.photos : [];
  });

  /** Thumbnail URLs of the loaded spot's photos, the rail's frames; empty without photos or a photo host. */
  protected readonly thumbnails = computed(() =>
    this.photoKeys().map((key) => photoUrl(this.photoBaseUrl, key, 'thumb')),
  );

  /** The preview's cover thumbnail, shown in the reserved frame while the file loads. */
  protected readonly previewCover = computed(() => {
    const cover = this.preview()?.properties.cover;
    return cover && this.photoBaseUrl
      ? photoUrl(this.photoBaseUrl, cover, 'thumb')
      : null;
  });

  /**
   * Whether a detail whose file is not in holds the rail's first frame, while it loads and after
   * it failed: when the preview counts photos, or, for a cold link that knows nothing yet,
   * whenever a photo host could serve some. Dropping the frame on failure would move the name
   * up, and back down on RETRY.
   */
  protected readonly reservesRail = computed(() => {
    const view = this.view();
    if (view.status === 'loaded' || !this.photoBaseUrl) {
      return false;
    }
    return view.preview ? view.preview.properties.photoCount > 0 : true;
  });

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
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.closeViewer());

    // Fetch the viewer's chunk while nothing else needs the network, so the first photo opened
    // grows out of the rail at once instead of waiting for the download. A failed prefetch is
    // left for the first photo open to retry.
    afterNextRender(() => {
      const cancel = whenIdle(() => void this.loadViewer().catch(() => {}));
      destroyRef.onDestroy(cancel);
    });

    // A viewer shows the photos of the loaded spot it opened on: another spot, or the file being
    // loaded again, closes it.
    effect(() => {
      this.loadedId();
      untracked(() => this.closeViewer());
    });

    // Focus moves to the heading once per opened spot, and the pane starts at its top. The heading
    // is one element through loading, loaded and failed, so a file arriving later keeps the focus
    // where it is. A RETRY is the exception: the failed block that holds the focused button goes
    // with it, so focus returns to the heading, the one element every state keeps, and the
    // screen reader reads the name once rather than the changing lines. Focus must not scroll: the
    // sheet may still be growing, and scrolling the heading into view would carry the rail off
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
  }

  /**
   * Opens the photo viewer on rail photo `index`. The photo grows out of its rail frame, and focus
   * returns to that frame when the viewer closes; the viewer loads the full-size rendition over
   * the thumbnail the rail already holds. Until the viewer has loaded the open waits, and is
   * dropped if the viewer closes meanwhile (see {@link viewerGeneration}); one that fails to load
   * opens nothing and leaves the rail as it was, and the next photo chosen loads it again.
   */
  protected openPhoto(index: number): void {
    const spot = this.spot();
    const rail = this.rail();
    const opener = rail?.photoButton(index);
    if (!spot || !rail || !opener) {
      return;
    }
    this.closeViewer();
    const generation = this.viewerGeneration;
    const request = {
      spotName: spot.name,
      thumbs: this.thumbnails(),
      fulls: this.photoKeys().map((key) =>
        photoUrl(this.photoBaseUrl, key, 'full'),
      ),
      index,
      originOf: (photo: number) => rail.photoButton(photo),
    };
    this.loadViewer().then(
      (viewer) => {
        if (generation === this.viewerGeneration) {
          this.viewerHandle = viewer.open(request, opener);
        }
      },
      () => {},
    );
  }

  /**
   * Closes the viewer this detail opened, at once, and drops a photo open still waiting on the
   * viewer's load; a viewer that already closed itself ignores it.
   */
  private closeViewer(): void {
    this.viewerGeneration += 1;
    this.viewerHandle?.close();
    this.viewerHandle = null;
  }
}
