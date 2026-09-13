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
   * A `geo:` URI, so the phone opens whichever maps app the user actually has instead of a
   * hosted map. The `q=` pair is what navigates; the name in parentheses is the label that app
   * shows for the destination.
   */
  protected readonly directionsHref = computed(() => {
    const [lng, lat] = this.spot().geometry.coordinates;
    const label = encodeURIComponent(this.properties().name);
    return `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
  });
}
