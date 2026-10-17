import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
  type AfterViewInit,
} from '@angular/core';
import { SpotFeature } from '../../../models/spots/spot';
import { photoUrl, SPOTMAP_BACKEND } from '../../../services/spotmap-backend';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { SpotPhotoGalleryComponent } from '../spot-photo-gallery/spot-photo-gallery.component';

/**
 * Put on the MapLibre popup that carries this component, so the stylesheet here can repaint the
 * frame MapLibre builds around it. Kept next to the styles that depend on it.
 */
export const SPOT_POPUP_FRAME_CLASS = 'spot-popup-frame';

/**
 * A tapped spot: its photos, its name and notes, whether it still stands, and how to get there.
 * The gallery stays put on top; everything below it is one scroller, so a popup the map caps to
 * its visible space still reaches the directions. It carries its own close button, which MapLibre
 * no longer builds, and reports a press through {@link SpotPopupComponent.closeRequested}.
 */
@Component({
  selector: 'app-spot-popup',
  imports: [SpotPhotoGalleryComponent, PointerBloomDirective],
  templateUrl: './spot-popup.component.html',
  styleUrl: './spot-popup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPopupComponent implements AfterViewInit {
  /** The tapped spot, as the map's source holds it. */
  spot = input.required<SpotFeature>();

  /**
   * Set by the map when the body overflows the height it capped the popup to; with it the body's
   * bottom edge fades while more content is below.
   */
  scrolls = input(false);

  /** The popup's own close button was pressed; the map owns closing it. */
  closeRequested = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly gallery = viewChild<
    SpotPhotoGalleryComponent,
    ElementRef<HTMLElement>
  >(SpotPhotoGalleryComponent, { read: ElementRef });
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');

  /** Whether the body is scrolled to its end, so nothing is left below to hint at. */
  protected readonly atEnd = signal(false);

  /** The fade shows only on a capped body that still has content below its fold. */
  protected readonly moreBelow = computed(
    () => this.scrolls() && !this.atEnd(),
  );

  /**
   * The popup's uncapped sizes, for the map's fit: the gallery at its natural 4:3 (0 without
   * photos) and the rest of this component at full height, read from the scroller's scroll height so
   * a popup that is already capped still measures what it would need.
   */
  naturalHeights(): { gallery: number; body: number } {
    const host = this.host.nativeElement;
    const gallery = this.gallery()?.nativeElement;
    const body = this.body().nativeElement;
    const galleryNow = gallery?.offsetHeight ?? 0;
    return {
      gallery: gallery ? (gallery.offsetWidth * 3) / 4 : 0,
      body:
        host.offsetHeight - galleryNow - body.clientHeight + body.scrollHeight,
    };
  }

  /**
   * Follows the body's size as well as its scroll position. A re-fit that shrinks or grows the
   * popup's height cap resizes the body without moving `scrollTop`, so no scroll event reports it,
   * and the cap eases over 200 ms, so only the observer sees the size it settles on.
   */
  ngAfterViewInit(): void {
    const body = this.body().nativeElement;
    const observer = new ResizeObserver(() => this.onBodyScroll(body));
    observer.observe(body);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /**
   * Tracks whether the body is scrolled to its end, on every scroll and every resize; the 1 px
   * slack absorbs fractional scroll offsets.
   */
  protected onBodyScroll(body: HTMLElement): void {
    this.atEnd.set(body.scrollTop + body.clientHeight >= body.scrollHeight - 1);
  }

  private readonly backend = inject(SPOTMAP_BACKEND);

  /**
   * Thumbnail URLs of the spot's photos, in gallery order. Empty when the spot has none or no
   * photo host is configured — then neither the gallery nor the photo mark renders.
   */
  protected readonly thumbnails = computed(() => {
    const base = this.backend.photoBaseUrl;
    return base
      ? this.properties().photos.map((key) => photoUrl(base, key, 'thumb'))
      : [];
  });

  /** The spot's own fields, as the template reads them. */
  protected readonly properties = computed(() => this.spot().properties);

  /** Whether the spot is on the record but no longer stands. */
  protected readonly isDemolished = computed(
    () => this.properties().status === 'demolished',
  );

  /**
   * A Google Maps URL rather than a `geo:` URI: iOS registers no handler for `geo:`, so that
   * link was dead in Safari. This is the only single URL that reaches a native maps app on both
   * phone platforms, and where no app claims it the browser still lands on a usable route. That
   * fallback is a real top-level navigation, so the template opens the link in a new browsing
   * context — an unhandled hand-off must never take the archive's map, selection and popup down
   * with it. The destination stays coordinates — the spot's name would be geocoded to whatever
   * it matches, which is not where the spot is.
   */
  protected readonly directionsHref = computed(() => {
    const [lng, lat] = this.spot().geometry.coordinates;
    const destination = encodeURIComponent(`${lat},${lng}`);
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  });
}
