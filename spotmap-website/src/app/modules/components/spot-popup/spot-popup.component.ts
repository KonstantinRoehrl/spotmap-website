import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { SpotFeature } from '../../../models/spots/spot';
import { SpotPhotoGalleryComponent } from '../spot-photo-gallery/spot-photo-gallery.component';

/**
 * Put on the MapLibre popup that carries this component, so the stylesheet here can repaint the
 * frame MapLibre builds around it. Kept next to the styles that depend on it.
 */
export const SPOT_POPUP_FRAME_CLASS = 'spot-popup-frame';

/** A tapped spot: its photos, its name, whether it still stands, and how to get there. */
@Component({
  selector: 'app-spot-popup',
  imports: [SpotPhotoGalleryComponent],
  templateUrl: './spot-popup.component.html',
  styleUrl: './spot-popup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPopupComponent {
  spot = input.required<SpotFeature>();

  protected readonly properties = computed(() => this.spot().properties);

  protected readonly isDemolished = computed(
    () => this.properties().status === 'demolished',
  );

  /**
   * A Google Maps URL rather than a `geo:` URI: iOS registers no handler for `geo:`, so that
   * link was dead in Safari. This form hands off to the maps app on both phones that have it
   * and falls back to the maps site where they don't. The destination stays coordinates — the
   * spot's name would be geocoded to whatever it matches, which is not where the spot is.
   */
  protected readonly directionsHref = computed(() => {
    const [lng, lat] = this.spot().geometry.coordinates;
    const destination = encodeURIComponent(`${lat},${lng}`);
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  });
}
