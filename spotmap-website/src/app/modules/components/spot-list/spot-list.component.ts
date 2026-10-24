import { LocationStrategy } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import type { SpotListFeature } from '../../../models/spots/spot';
import { photoUrl, SPOTMAP_BACKEND } from '../../../services/spotmap-backend';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';

/**
 * The spots in view, one row each in the order given (the page store sorts them A–Z): the cover
 * thumbnail, the name and a dim photo-count line. Every row is a real link to `/spot/<id>`, so
 * middle-click and open-in-new-tab work, but a plain click is handed to the page through
 * {@link SpotListComponent.open}: the page decides whether the URL is pushed or replaced and
 * freezes the list before it navigates. A row is lit like a hovered control while its pin is
 * hovered, and reports its own hover back on a hover-capable pointer.
 */
@Component({
  selector: 'app-spot-list',
  imports: [PointerBloomDirective],
  templateUrl: './spot-list.component.html',
  styleUrl: './spot-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotListComponent {
  /** The rows, in display order; `null` while the city's spots are still loading. */
  spots = input<readonly SpotListFeature[] | null>(null);

  /** A line shown above the rows: a spot link whose spot is gone from the archive. */
  notice = input<'not-found' | null>(null);

  /** The spot whose row is lit because its pin is hovered on the map. */
  highlightedId = input<string | null>(null);

  /**
   * The row to focus once it is on screen — the one a closed detail was opened from. Each value
   * moves focus once; later renders leave focus wherever the visitor took it.
   */
  focusId = input<string | null>(null);

  /** A row was opened in place by a plain primary click; carries the spot id. */
  open = output<string>();

  /** The pointer entered a row (its spot id) or left it (`null`); hover-capable pointers only. */
  hover = output<string | null>();

  /** The component's own element, searched for the row {@link focusId} names. */
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Prefixes the row links with the app's base href. */
  private readonly locationStrategy = inject(LocationStrategy);

  /** The photo host's root; empty when unconfigured, which draws every row's NO PHOTO box. */
  private readonly photoBaseUrl = inject(SPOTMAP_BACKEND).photoBaseUrl;

  /**
   * Whether the pointer can hover, cached once as PointerBloomDirective caches its query: `.matches`
   * stays live. A touch screen fires `mouseenter` on a tap, which must not light a pin.
   */
  private readonly hoverPointer =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover)')
      : null;

  /** The {@link focusId} value focus has already moved to, so each value moves it once. */
  private focusedId: string | null = null;

  constructor() {
    // Runs after the rows render, so a focus asked for before its row exists lands once it does.
    afterRenderEffect(() => {
      const id = this.focusId();
      this.spots();
      if (id === null) {
        this.focusedId = null;
        return;
      }
      if (id === this.focusedId) {
        return;
      }
      const row = this.host.querySelector<HTMLAnchorElement>(
        `a[data-spot-id="${CSS.escape(id)}"]`,
      );
      if (row) {
        this.focusedId = id;
        row.focus();
      }
    });
  }

  /** The row's link, `/spot/<id>` under the app's base href (`/spotmap-website/` when deployed). */
  protected hrefFor(id: string): string {
    return this.locationStrategy.prepareExternalUrl(
      `/spot/${encodeURIComponent(id)}`,
    );
  }

  /** The cover's thumbnail URL, or `null` for a spot without photos or a build without a photo host. */
  protected thumbnailFor(spot: SpotListFeature): string | null {
    const { cover } = spot.properties;
    return cover && this.photoBaseUrl
      ? photoUrl(this.photoBaseUrl, cover, 'thumb')
      : null;
  }

  /** The dim line under the name: the photo count, after `DEMOLISHED · ` for a spot that is gone. */
  protected metaFor(spot: SpotListFeature): string {
    const count = spot.properties.photoCount;
    const photos =
      count === 0 ? 'NO PHOTOS' : count === 1 ? '1 PHOTO' : `${count} PHOTOS`;
    return spot.properties.status === 'demolished'
      ? `DEMOLISHED · ${photos}`
      : photos;
  }

  /**
   * Opens the row in place on a plain primary click. A modified click (new tab, new window,
   * download) or another button is left to the browser, which follows the row's `href`.
   */
  protected onRowClick(event: MouseEvent, id: string): void {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    this.open.emit(id);
  }

  /** Reports the pointer entering (`id`) or leaving (`null`) a row, on a hover-capable pointer only. */
  protected onRowHover(id: string | null): void {
    if (this.hoverPointer?.matches) {
      this.hover.emit(id);
    }
  }
}
