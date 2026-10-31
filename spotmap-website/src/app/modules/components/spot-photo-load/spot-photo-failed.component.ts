import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The map's failure voice for a photo that did not load, drawn in the frame the photo would have
 * filled. Hosts place it and set its padding through their own class on the element.
 */
@Component({
  selector: 'app-spot-photo-failed',
  templateUrl: './spot-photo-failed.component.html',
  styleUrl: './spot-photo-failed.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': "label() === null ? null : 'img'",
    '[attr.aria-label]': 'label()',
    '[attr.aria-hidden]': "label() === null ? 'true' : null",
  },
})
export class SpotPhotoFailedComponent {
  /** What assistive technology hears; `null` hides the words, for a host that already says them. */
  readonly label = input<string | null>(null);
}
