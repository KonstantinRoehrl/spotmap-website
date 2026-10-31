import { LocationStrategy } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  viewChild,
} from '@angular/core';
import type { SpotListFeature } from '../../../models/spots/spot';
import { SpotPhotos } from '../../../services/spot-photos.service';
import { canHover } from '../../../utils/input-capabilities';
import { PointerBloomRowsDirective } from '../../directives/pointer-bloom.directive';

/** One row as the template draws it, derived once per list change. */
interface SpotListRow {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  readonly thumbnail: string | null;
  readonly meta: string;
}

/**
 * The spots in view, one row each in the order given (the page store sorts them A–Z): the cover
 * thumbnail, the name and a dim photo-count line. Every row is a real link to `/spot/<id>`, so
 * middle-click and open-in-new-tab work, but a plain click is handed to the page through
 * {@link SpotListComponent.open}: the page decides whether the URL is pushed or replaced and
 * freezes the list before it navigates. A row is lit like a hovered control while its pin is
 * hovered, and reports its own hover back on a hover-capable pointer. A gone link's notice sits
 * above the rows and takes its room in and out with a fade, so the rows never jump.
 *
 * Rows are derived once per list change. Click, hover and the pointer bloom hang off the `<ul>`
 * rather than each row, and the lit row's class is written by hand, so neither a hover nor a pin
 * costs a pass over the rows.
 */
@Component({
  selector: 'app-spot-list',
  imports: [PointerBloomRowsDirective],
  templateUrl: './spot-list.component.html',
  styleUrl: './spot-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotListComponent {
  /** The rows, in display order; `null` while the city's spots are still loading. */
  spots = input<readonly SpotListFeature[] | null>(null);

  /**
   * A line shown above the rows: a spot link whose spot is gone from the archive. The list only
   * draws it; the page announces it, through a live region that exists before the notice does.
   */
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

  private readonly spotPhotos = inject(SpotPhotos);

  /** Hangs the hover listeners outside the zone; a hover emit re-enters it. */
  private readonly zone = inject(NgZone);

  /** The {@link focusId} value focus has already moved to, so each value moves it once. */
  private focusedId: string | null = null;

  /** The `<ul>`, which comes and goes with the loading and empty states. */
  private readonly rowList = viewChild<ElementRef<HTMLUListElement>>('rowList');

  /** The rows as drawn; `null` while the city's spots are still loading. */
  protected readonly rows = computed<readonly SpotListRow[] | null>(
    () => this.spots()?.map((spot) => this.toRow(spot)) ?? null,
  );

  /** The row now lit from its pin. */
  private litRow: HTMLElement | null = null;

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

    // By hand rather than a class binding per row, so a hover writes one row and evaluates none.
    // `rows()` lights a row that arrives after its pin was hovered.
    afterRenderEffect(() => {
      const id = this.highlightedId();
      this.rows();
      // A row fading out keeps its light until it is gone.
      if (!this.litRow?.closest('.spot-list__item--leaving')) {
        this.litRow?.classList.remove('is-highlighted');
      }
      this.litRow =
        id === null
          ? null
          : this.host.querySelector<HTMLElement>(
              `.spot-list__item:not(.spot-list__item--leaving) > a[data-spot-id="${CSS.escape(id)}"]`,
            );
      this.litRow?.classList.add('is-highlighted');
    });

    afterRenderEffect((onCleanup) => {
      const list = this.rowList()?.nativeElement;
      if (!list) {
        return;
      }
      const over = (event: MouseEvent) => this.onMouseOver(event);
      const out = (event: MouseEvent) => this.onMouseOut(event);
      this.zone.runOutsideAngular(() => {
        list.addEventListener('mouseover', over);
        list.addEventListener('mouseout', out);
      });
      onCleanup(() => {
        list.removeEventListener('mouseover', over);
        list.removeEventListener('mouseout', out);
      });
    });
  }

  /**
   * Opens the row in place on a plain primary click. A modified click (new tab, new window,
   * download) or another button is left to the browser, which follows the row's `href`, and so is
   * a click off any row.
   */
  protected onListClick(event: MouseEvent): void {
    const id = rowIdOf(event.target);
    if (
      id === null ||
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

  /**
   * The pointer reached a row from outside it. No "last hovered" state: a list that comes back
   * under a stationary pointer must still report it.
   */
  private onMouseOver(event: MouseEvent): void {
    const id = rowIdOf(event.target);
    if (id !== null && id !== rowIdOf(event.relatedTarget)) {
      this.reportHover(id);
    }
  }

  /** The pointer left a row for somewhere outside it. */
  private onMouseOut(event: MouseEvent): void {
    const id = rowIdOf(event.target);
    if (id !== null && id !== rowIdOf(event.relatedTarget)) {
      this.reportHover(null);
    }
  }

  /** Reports the hover on a hover-capable pointer only, back in the zone the page's state lives in. */
  private reportHover(id: string | null): void {
    if (canHover()) {
      this.zone.run(() => this.hover.emit(id));
    }
  }

  private toRow(spot: SpotListFeature): SpotListRow {
    const { id, name, photoCount, status } = spot.properties;
    const photos =
      photoCount === 0
        ? 'NO PHOTOS'
        : photoCount === 1
          ? '1 PHOTO'
          : `${photoCount} PHOTOS`;
    return {
      id,
      name,
      href: this.locationStrategy.prepareExternalUrl(
        `/spot/${encodeURIComponent(id)}`,
      ),
      thumbnail: this.spotPhotos.coverThumb(spot.properties),
      meta: status === 'demolished' ? `DEMOLISHED · ${photos}` : photos,
    };
  }
}

/** The id of the row `target` is in, or `null` off any row. */
function rowIdOf(target: EventTarget | null): string | null {
  return target instanceof Element
    ? (target.closest<HTMLElement>('a[data-spot-id]')?.dataset['spotId'] ??
        null)
    : null;
}
