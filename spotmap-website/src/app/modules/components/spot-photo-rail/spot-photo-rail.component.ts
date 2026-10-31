import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { AsciiRainComponent } from '../ascii-rain/ascii-rain.component';
import { ImageLoadTracker } from '../spot-photo-load/image-load-tracker';
import { SpotPhotoFailedComponent } from '../spot-photo-load/spot-photo-failed.component';

/**
 * A spot's photos as a horizontal rail of 4:3 frames in the detail, 8 px apart, each as wide as the
 * detail says (`--rail-photo-width`, set by the photo group that holds the rail, which the reserved
 * loading frame shares; the host must sit inside such a group). The rail bleeds to the edges of the
 * panel it sits in while it scrolls and snaps each photo to the panel's 16 px inset; a finger, a
 * trackpad or Shift + wheel scroll it, natively. Each photo is a button that asks for the photo
 * viewer (`open`), and {@link photoButton} hands that button to the viewer to grow out of and
 * return focus to.
 *
 * Each frame loads like the gallery's slide: a small block of rain until its photo arrives, then a
 * crossfade; a photo already in the browser's cache shows at once; a photo that fails shows the
 * map's failure voice in its frame and the others carry on. Nothing in the rail is the current
 * selection, so it carries no amber.
 */
@Component({
  selector: 'app-spot-photo-rail',
  imports: [
    AsciiRainComponent,
    PointerBloomDirective,
    SpotPhotoFailedComponent,
  ],
  templateUrl: './spot-photo-rail.component.html',
  styleUrl: './spot-photo-rail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPhotoRailComponent {
  /** Thumbnail URLs (`SpotPhotos.thumb`) in gallery order; at least one. */
  readonly photos = input.required<readonly string[]>();
  /** The spot's name, for each photo's alt text. */
  readonly spotName = input.required<string>();

  /** A photo was chosen (click, tap, Enter or Space on its button): its index. */
  readonly open = output<number>();

  /** The frames' buttons, in photo order. */
  private readonly buttons =
    viewChildren<ElementRef<HTMLButtonElement>>('photoButton');

  /** The load state of the rail's images. */
  protected readonly images = new ImageLoadTracker();
  /** The URLs whose image has loaded; their frames show the photo. */
  protected readonly loaded = this.images.loaded;
  /** The URLs whose image failed to load; their frames show the placeholder. */
  protected readonly failed = this.images.failed;
  /** The URLs whose image was already complete on render; their frames show it without a fade. */
  protected readonly instant = this.images.instant;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // A cached image may have finished before the `(load)` listener could hear it, so after each
    // render the images themselves are asked whether they are already complete.
    afterRenderEffect(() => {
      this.photos();
      for (const image of Array.from(
        host.querySelectorAll<HTMLImageElement>('img.rail__img'),
      )) {
        this.images.noteComplete(image, { instant: true });
      }
    });
  }

  /** The button showing photo `index`, or `null` when there is none; the viewer grows out of it and focus returns to it. */
  photoButton(index: number): HTMLElement | null {
    return this.buttons()[index]?.nativeElement ?? null;
  }
}
