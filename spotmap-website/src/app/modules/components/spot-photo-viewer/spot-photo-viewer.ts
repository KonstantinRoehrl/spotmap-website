import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import {
  SpotPhotoViewerComponent,
  VIEWER_BACKDROP_CLASS,
  VIEWER_PANE_CLASS,
} from './spot-photo-viewer.component';

/** What the viewer shows and where it grows from. */
export interface PhotoViewerRequest {
  /** The spot's name: the title row, the dialog's name and the photos' alt text. */
  readonly spotName: string;
  /** Thumbnail URLs in gallery order (the strip, and each photo's instant first frame). */
  readonly thumbs: readonly string[];
  /** Full-size URLs, same order and length as `thumbs`. */
  readonly fulls: readonly string[];
  /** The photo to open on. */
  readonly index: number;
  /**
   * The rail photo showing `index`, or `null` when there is none: the photo grows out of it on
   * open and shrinks back into it on close (it fades when this is `null` or off screen).
   */
  readonly originOf: (index: number) => HTMLElement | null;
}

/** An open viewer, as its opener holds it. */
export interface PhotoViewerHandle {
  /**
   * Closes the viewer at once, without motion, consuming its history entry: for a detail that goes
   * away under it. Idempotent: a no-op once the viewer has closed by any path (✕, Esc, scrim, Back),
   * so a stale handle never calls `PlatformLocation.back()`.
   */
  close(): void;
}

/**
 * Opens a spot's photos in the modal viewer (`SpotPhotoViewerComponent`). The CDK dialog does the
 * modal work: an overlay over the whole app, nav included, `aria-modal`, the rest of the page
 * hidden from assistive technology, focus trapped inside and returned to the opener. Every close is
 * the viewer's own (`disableClose`), so each can run its motion and settle the history entry first,
 * and navigation does not close it (`closeOnNavigation: false`), since Back is the viewer's to
 * handle.
 */
@Injectable({ providedIn: 'root' })
export class SpotPhotoViewer {
  /** The CDK's dialog service. */
  private readonly dialog = inject(Dialog);

  /** Opens the viewer as a modal CDK dialog over the whole app; focus returns to `opener` when it closes. */
  open(request: PhotoViewerRequest, opener: HTMLElement): PhotoViewerHandle {
    const ref = this.dialog.open<
      void,
      PhotoViewerRequest,
      SpotPhotoViewerComponent
    >(SpotPhotoViewerComponent, {
      data: request,
      role: 'dialog',
      ariaModal: true,
      ariaLabel: `Photos of ${request.spotName}`,
      autoFocus: 'dialog',
      restoreFocus: opener,
      disableClose: true,
      closeOnNavigation: false,
      hasBackdrop: true,
      backdropClass: VIEWER_BACKDROP_CLASS,
      panelClass: VIEWER_PANE_CLASS,
    });
    // Once the dialog has closed, the CDK drops `componentInstance`, so a stale handle reaches
    // nothing; while a close is running, `closeNow()` guards itself.
    return { close: () => ref.componentInstance?.closeNow() };
  }
}
