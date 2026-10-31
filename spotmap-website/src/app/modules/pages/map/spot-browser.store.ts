import { Location } from '@angular/common';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import { CityEnum } from '../../../models/enums/map-enum';
import {
  MapFocus,
  SPOT_FOCUS_ZOOM,
  ViewBounds,
} from '../../../models/map/map-camera';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import type {
  SpotDetail,
  SpotListCollection,
  SpotListFeature,
} from '../../../models/spots/spot';
import type { SpotDetailView } from '../../../models/spots/spot-detail-view';
import {
  LoadedSpotsInView,
  SpotsInView,
} from '../../../models/spots/spots-in-view';
import {
  SpotDetailResult,
  SpotsService,
} from '../../../services/spots.service';
import { SPOT_ID_PARAM } from '../../../utils/map-page-path';
import {
  readStoredCity,
  storeCity,
} from '../../components/city-picker/stored-city';

/** Follows an open spot's name in the document title: `ALPHA BANK · SPOTMAP`. */
export const DOCUMENT_TITLE_SUFFIX = ' · SPOTMAP';

/** One finished detail load: what it found, or `null` when no source could answer. */
interface DetailAnswer {
  readonly id: string;
  readonly result: SpotDetailResult | null;
}

/**
 * The map page's state: which city is shown and built, which spot is open, the A–Z list of the
 * spots in view, the open spot's detail, and the not-found notice. Provided by `MapComponent`, so it
 * lives as long as the page and reads the page's own route.
 *
 * The open spot comes from the URL and nowhere else (`/spot/<id>`): a pin or a row asks
 * {@link open}, which navigates, and the store reacts to the route like the map, the list and the
 * title do. Opening from `/map` pushes a history entry; the list is frozen as it was whenever the
 * route moves from `/map` to a spot — by a click or by the browser's Forward — and set free when it
 * returns. Switching to another spot replaces the entry; {@link close} goes back to the entry it
 * pushed, or replaces a link that was opened cold with `/map`. A cold link holds the map back
 * (`mapCity` null) until the spot's detail names its city, so the remembered city is never built
 * only to be replaced.
 */
@Injectable()
export class SpotBrowserStore {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly title = inject(Title);
  private readonly spots = inject(SpotsService);

  /** The document title before any spot opened; put back when the detail closes or the page goes. */
  private readonly pageTitle = this.title.getTitle();

  /** The open spot's id as the route carries it, each change once. */
  private readonly routeIds: Observable<string | null> = inject(
    ActivatedRoute,
  ).paramMap.pipe(
    map((params) => params.get(SPOT_ID_PARAM)),
    distinctUntilChanged(),
  );

  /** The open spot's id, from `/spot/<id>`; null on `/map`. */
  readonly selectedId = toSignal(this.routeIds, { requireSync: true });

  private readonly cityState = signal<MapItem>(readStoredCity());
  /** The city the visitor is looking at: the remembered one, a picked one, or a link's. */
  readonly city = this.cityState.asReadonly();

  private readonly mapCityState = signal<CityEnum | null>(
    this.selectedId() === null ? this.cityState().city : null,
  );
  /**
   * The city the map builds; null while a cold `/spot/<id>` is still finding out which city it
   * belongs to, so no map is built for a city about to be replaced.
   */
  readonly mapCity = this.mapCityState.asReadonly();

  private readonly openOnState = signal<MapFocus | null>(null);
  /**
   * Where the next map build opens instead of the city's framing: the spot of a link that named
   * the city. Read once per build by the map; replaced by the next city change.
   */
  readonly openOn = this.openOnState.asReadonly();

  /**
   * The spots in the current view, A–Z; null until both the list and the view are known. Equal
   * answers are one value ({@link sameSpots}), so a pan that changes nothing in the view notifies
   * nobody, though the map reports its bounds on every frame it moves.
   */
  private readonly liveSpots = signal<readonly SpotListFeature[] | null>(null, {
    equal: sameSpots,
  });
  /** The list as it was when a spot opened from `/map`; null when nothing is frozen. */
  private readonly frozenSpots = signal<readonly SpotListFeature[] | null>(
    null,
  );
  /** What the list shows: frozen while a spot opened from `/map` is open, live otherwise. */
  readonly shownSpots = computed(() => this.frozenSpots() ?? this.liveSpots());

  private readonly detailState = signal<SpotDetailView | null>(null);
  /** The open spot's detail as it loads; null while no spot is open. */
  readonly detail = this.detailState.asReadonly();

  private readonly noticeState = signal<'not-found' | null>(null);
  /** `not-found` after a link to a spot the archive no longer has, until the next interaction. */
  readonly notice = this.noticeState.asReadonly();

  private readonly hoveredIdState = signal<string | null>(null);
  /**
   * The spot under the pointer, on its pin or its row; both light it. Dropped whenever what is
   * under the pointer may have gone: a spot opening or closing, a city change, a list without it.
   */
  readonly hoveredId = this.hoveredIdState.asReadonly();

  private readonly returnFocusState = signal<string | null>(null);
  /**
   * The row that opened the current or last detail, for focus to return to; null when no row did:
   * a pin, a link, the browser's Forward.
   */
  readonly returnFocusTo = this.returnFocusState.asReadonly();

  /** The loaded city's in-view answer; null until its list has arrived. */
  private inView: SpotsInView | null = null;
  /**
   * All of the loaded city's spots in the list shape, in view or not; empty until the list has
   * arrived. A spot's preview is read from here, not asked of {@link inView}, which may answer
   * later (Phase 11).
   */
  private loadedSpots: readonly SpotListFeature[] = [];
  /** The map's visible bounds; null until it has reported them. */
  private bounds: ViewBounds | null = null;
  /** Asks the in-view source again, for the current list and bounds. */
  private readonly viewQueries = new Subject<void>();
  /** The detail loads, one per opened id; `null` cancels the one running. */
  private readonly detailLoads = new Subject<string | null>();

  /** The id the route carried last, to tell an opening (none → id) from a switch (id → id). */
  private previousId: string | null = null;
  /** True until the route's first value has been handled: an id there is a cold link. */
  private firstRouteValue = true;
  /**
   * Whether the open spot's history entry was pushed over `/map` on this page, so closing can go
   * back to it instead of adding a `/map` entry on top.
   */
  private pushedOverMap = false;
  /**
   * Set from the first {@link close} until the route changes: closing goes back in history, which
   * is not instant, and a second tap in the meantime would go back once more, out of the page.
   */
  private closing = false;
  /**
   * The id a row asked {@link open} for, until the route reaches it: only that opening returns
   * focus to a row; one by a pin, a link or the browser's Forward does not.
   */
  private openedFromRow: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.title.setTitle(this.pageTitle));

    this.viewQueries
      .pipe(
        switchMap(() =>
          this.inView && this.bounds
            ? this.inView.spotsIn(this.bounds)
            : of(null),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((spots) => {
        this.liveSpots.set(spots);
        this.dropHoverOutside(spots);
      });

    this.detailLoads
      .pipe(
        switchMap((id) =>
          id === null
            ? EMPTY
            : this.spots.loadSpotDetail(id).pipe(
                map((result): DetailAnswer => ({ id, result })),
                catchError(() => of<DetailAnswer>({ id, result: null })),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ id, result }) => this.onDetailAnswer(id, result));

    // Subscribed after the two pipelines above, so a cold link's first id can start its load.
    this.routeIds
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.onRouteId(id));
  }

  /**
   * The picker's choice. A different city closes an open spot (back to `/map`), is remembered, and
   * starts fresh: no list, no view, no notice, the city's own framing.
   */
  selectCity(city: MapItem): void {
    if (city.city === this.cityState().city) {
      return;
    }
    if (this.selectedId() !== null) {
      void this.router.navigate(['/map'], { replaceUrl: true });
    }
    this.noticeState.set(null);
    this.switchCity(city, null);
  }

  /** The map's list of the city's spots, as it arrived for the current build. */
  setList(collection: SpotListCollection): void {
    this.loadedSpots = collection.features;
    this.inView = new LoadedSpotsInView(collection);
    this.viewQueries.next();
  }

  /** The map's visible bounds — on a phone the part the sheet does not cover. */
  setBounds(bounds: ViewBounds): void {
    this.bounds = bounds;
    this.viewQueries.next();
  }

  /**
   * Opens a spot from a row (`list`) or a pin (`pin`). From `/map` this pushes `/spot/<id>`; with a
   * spot already open it replaces the entry, so Back returns to the list rather than walking
   * through every spot.
   */
  open(id: string, origin: 'list' | 'pin'): void {
    this.noticeState.set(null);
    const current = this.selectedId();
    if (current === id) {
      return;
    }
    this.openedFromRow = origin === 'list' ? id : null;
    void this.router.navigate(
      ['/spot', id],
      current === null ? undefined : { replaceUrl: true },
    );
  }

  /**
   * Closes the open spot: back to the entry this page pushed it over, or — for a link opened cold,
   * whose previous entry is another site — by replacing it with `/map`. Asking again before the
   * route has changed does nothing.
   */
  close(): void {
    if (this.selectedId() === null || this.closing) {
      return;
    }
    this.closing = true;
    if (this.pushedOverMap) {
      this.location.back();
    } else {
      void this.router
        .navigate(['/map'], { replaceUrl: true })
        .finally(() => (this.closing = false));
    }
  }

  /** Loads the open spot's detail again after a failure. */
  retryDetail(): void {
    const id = this.selectedId();
    if (id !== null) {
      this.startDetail(id);
    }
  }

  /** The spot under the pointer on its pin or its row, or null. */
  setHovered(id: string | null): void {
    this.hoveredIdState.set(id);
  }

  /** Drops the not-found notice; the page calls it on the visitor's next pointer or key press. */
  dismissNotice(): void {
    this.noticeState.set(null);
  }

  /**
   * Reacts to the route, however it got there — a click, the browser's Back or Forward, a link: a
   * closed detail, a newly opened spot, or a switch to another.
   */
  private onRouteId(id: string | null): void {
    const previous = this.previousId;
    const first = this.firstRouteValue;
    const openedFromRow = this.openedFromRow;
    this.previousId = id;
    this.firstRouteValue = false;
    this.openedFromRow = null;
    this.closing = false;
    this.hoveredIdState.set(null);
    if (id === null) {
      this.pushedOverMap = false;
      this.frozenSpots.set(null);
      this.detailLoads.next(null);
      this.setDetail(null);
      return;
    }
    if (previous === null) {
      this.pushedOverMap = !first;
      // A cold link has no list yet, so there is nothing to keep: its list follows the view.
      this.frozenSpots.set(this.liveSpots());
    }
    this.returnFocusState.set(openedFromRow === id ? id : null);
    this.startDetail(id);
  }

  /** Shows what the list knows about `id` at once and starts its detail load. */
  private startDetail(id: string): void {
    const current = this.detailState();
    const preview =
      this.inViewFeature(id) ??
      (current !== null && current.id === id && current.status !== 'loaded'
        ? current.preview
        : null);
    this.setDetail({ status: 'loading', id, preview });
    this.detailLoads.next(id);
  }

  /** Applies a finished detail load, unless the visitor has moved on to another spot. */
  private onDetailAnswer(id: string, result: SpotDetailResult | null): void {
    if (this.selectedId() !== id) {
      return;
    }
    if (result === null) {
      const current = this.detailState();
      this.setDetail({
        status: 'failed',
        id,
        preview:
          current !== null && current.status !== 'loaded'
            ? current.preview
            : null,
      });
      this.showRememberedMapIfHeld();
      return;
    }
    const city =
      result.type === 'found' ? supportedCity(result.spot.city) : null;
    if (result.type === 'not-found' || city === null) {
      this.onNotFound();
      return;
    }
    const focus = spotFocus(result.spot);
    if (city.city !== this.cityState().city) {
      this.switchCity(city, focus);
    } else if (this.mapCityState() === null) {
      this.mapCityState.set(city.city);
      this.openOnState.set(focus);
    }
    this.setDetail({ status: 'loaded', id, spot: result.spot });
  }

  /** A spot the archive does not have (any more): the remembered map, `/map`, and the notice. */
  private onNotFound(): void {
    this.noticeState.set('not-found');
    this.setDetail(null);
    this.showRememberedMapIfHeld();
    void this.router.navigate(['/map'], { replaceUrl: true });
  }

  /** Builds the remembered city's map if a cold link was holding it back. */
  private showRememberedMapIfHeld(): void {
    if (this.mapCityState() === null) {
      this.mapCityState.set(this.cityState().city);
    }
  }

  /** Makes `city` the shown, built and remembered city, opening on `focus` when given. */
  private switchCity(city: MapItem, focus: MapFocus | null): void {
    this.cityState.set(city);
    this.mapCityState.set(city.city);
    storeCity(city.city);
    this.openOnState.set(focus);
    this.inView = null;
    this.loadedSpots = [];
    this.bounds = null;
    this.frozenSpots.set(null);
    this.hoveredIdState.set(null);
    this.viewQueries.next();
  }

  /** The loaded city's feature for `id`, whether or not it is in view or in the list shown. */
  private inViewFeature(id: string): SpotListFeature | null {
    const isSpot = (feature: SpotListFeature) => feature.properties.id === id;
    return (
      this.shownSpots()?.find(isSpot) ?? this.loadedSpots.find(isSpot) ?? null
    );
  }

  /** Forgets the hovered spot unless it is among `spots`, the list the view now holds. */
  private dropHoverOutside(spots: readonly SpotListFeature[] | null): void {
    const hovered = this.hoveredIdState();
    if (
      hovered !== null &&
      !spots?.some((feature) => feature.properties.id === hovered)
    ) {
      this.hoveredIdState.set(null);
    }
  }

  /** Sets the detail and the document title that follows its name. */
  private setDetail(view: SpotDetailView | null): void {
    this.detailState.set(view);
    const name =
      view === null
        ? null
        : view.status === 'loaded'
          ? view.spot.name
          : (view.preview?.properties.name ?? null);
    this.title.setTitle(
      name === null
        ? this.pageTitle
        : `${name.toUpperCase()}${DOCUMENT_TITLE_SUFFIX}`,
    );
  }
}

/**
 * Whether two answers of the in-view source are the same list: the same spots in the same order.
 * By identity of each spot, which {@link LoadedSpotsInView} keeps from one answer to the next.
 */
function sameSpots(
  a: readonly SpotListFeature[] | null,
  b: readonly SpotListFeature[] | null,
): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.length === b.length &&
      a.every((spot, index) => spot === b[index]))
  );
}

/**
 * The picker's entry for a city slug, or null for one the app has no map for. `Object.hasOwn`, so
 * a slug such as `constructor` cannot reach an `Object.prototype` member.
 */
function supportedCity(slug: string): MapItem | null {
  return Object.hasOwn(SUPPORTED_CITIES, slug)
    ? SUPPORTED_CITIES[slug as CityEnum]
    : null;
}

/** Where a map built for `spot`'s city opens: on the spot, close enough for its photo pin. */
function spotFocus(spot: SpotDetail): MapFocus {
  return { center: [...spot.coordinates], zoom: SPOT_FOCUS_ZOOM };
}
