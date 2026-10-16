import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { SpotFeature } from '../../../models/spots/spot';
import { photoUrl, SPOTMAP_BACKEND } from '../../../services/spotmap-backend';
import { SpotPhotoGalleryComponent } from '../spot-photo-gallery/spot-photo-gallery.component';

/**
 * Put on the MapLibre popup that carries this component, so the stylesheet here can repaint the
 * frame MapLibre builds around it. Kept next to the styles that depend on it.
 */
export const SPOT_POPUP_FRAME_CLASS = 'spot-popup-frame';

/** A tapped spot: its photos, its name and notes, whether it still stands, and how to get there. */
@Component({
  selector: 'app-spot-popup',
  imports: [SpotPhotoGalleryComponent],
  templateUrl: './spot-popup.component.html',
  styleUrl: './spot-popup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPopupComponent {
  /** The tapped spot, as the map's source holds it. */
  spot = input.required<SpotFeature>();

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

  protected readonly properties = computed(() => this.spot().properties);

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
