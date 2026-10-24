import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  catchError,
  concat,
  filter,
  map,
  merge,
  mergeMap,
  Observable,
  of,
  take,
  takeWhile,
  throwError,
  timer,
} from 'rxjs';
import { CityEnum } from '../models/enums/map-enum';
import {
  SpotCollection,
  SpotDetail,
  SpotListCollection,
} from '../models/spots/spot';
import { toListCollection, toSpotDetail } from '../models/spots/spot-shapes';
import { SPOTMAP_BACKEND } from './spotmap-backend';

/** How long a live query may take, in total, before the map falls back to the bundled snapshot. */
export const LIVE_SPOTS_TIMEOUT_MS = 5000;

/**
 * The bundled id → city index `npm run snapshot:supabase` writes beside the city snapshots,
 * base-relative like them: it resolves a spot to its city's snapshot with the backend down.
 */
export const SPOT_INDEX_URL = 'spots/index.json';

/** The last event of a list load: the city's spots in the list shape, and where they came from. */
export interface SpotListLoaded {
  readonly type: 'done';
  readonly collection: SpotListCollection;
  readonly source: 'live' | 'snapshot';
}

/**
 * One real milestone of a list load, for the loader's progress: a request went out, its response
 * headers arrived, the live query gave up for the snapshot, or the spots are in.
 */
export type SpotListLoadEvent =
  | { readonly type: 'sent' }
  | { readonly type: 'headers' }
  | { readonly type: 'fallback' }
  | SpotListLoaded;

/**
 * The answer to one detail load: the spot and where it came from, or `not-found` — an id the live
 * database does not hold (final: never looked up in the snapshot, which can lag a deletion) or one
 * the snapshot does not hold when it stands in.
 */
export type SpotDetailResult =
  | {
      readonly type: 'found';
      readonly spot: SpotDetail;
      readonly source: 'live' | 'snapshot';
    }
  | { readonly type: 'not-found' };

/** One milestone of a collection load, live or from the snapshot, whatever shape it carries. */
type CollectionLoadEvent<C> =
  | { readonly type: 'sent' }
  | { readonly type: 'headers' }
  | { readonly type: 'fallback' }
  | {
      readonly type: 'done';
      readonly collection: C;
      readonly source: 'live' | 'snapshot';
    };

/**
 * Loads a city's spots and single spots. A city's spots come live from the Supabase query
 * `city_spot_list()`, in the list shape, when a backend is configured, otherwise, or when the live request fails, takes longer than
 * {@link LIVE_SPOTS_TIMEOUT_MS} in total, or answers with no spots, from the bundled
 * `spots/<city>.geojson` snapshot (the full shape, cut down for the list). Every city has spots, so
 * an empty live answer means an unseeded or out-of-date backend, not an empty city. A snapshot
 * failure reaches the caller (the map's error state and its RETRY, which asks live first again).
 * One spot comes live from `spot_detail()`, whose "no such spot" is final; only a failed or late
 * live request looks it up in the snapshot, through {@link SPOT_INDEX_URL}.
 */
@Injectable({ providedIn: 'root' })
export class SpotsService {
  private readonly http = inject(HttpClient);
  private readonly backend = inject(SPOTMAP_BACKEND);

  /**
   * The city's spots in the list shape, as milestones ending in one {@link SpotListLoaded}; see the
   * class comment for the fallback rules. The snapshot is mapped through `toListCollection()`.
   */
  loadSpotList(city: CityEnum): Observable<SpotListLoadEvent> {
    return this.loadCollection<SpotListCollection>(
      city,
      'city_spot_list',
      this.snapshotEvents(city).pipe(
        map((event) =>
          event.type === 'done'
            ? { ...event, collection: toListCollection(event.collection) }
            : event,
        ),
      ),
    );
  }

  /**
   * One spot's full record, as a single {@link SpotDetailResult} followed by completion. Live
   * first within {@link LIVE_SPOTS_TIMEOUT_MS}: a live `null` is `not-found` and final; a failed or
   * late live request falls back to the snapshot. The snapshot path errors when the index or the
   * city's snapshot cannot be fetched, which the detail pane turns into its RETRY.
   */
  loadSpotDetail(id: string): Observable<SpotDetailResult> {
    const snapshot = this.snapshotDetail(id);
    if (!this.backend.apiUrl) {
      return snapshot;
    }
    const live = this.http
      .get<SpotDetail | null>(
        `${this.backend.apiUrl}/rest/v1/rpc/spot_detail`,
        {
          params: { p_id: id },
          headers: this.apiHeaders(),
        },
      )
      .pipe(
        map((spot): SpotDetailResult =>
          spot === null
            ? { type: 'not-found' }
            : { type: 'found', spot, source: 'live' },
        ),
      );
    return merge(live, liveDeadline('the live spot')).pipe(
      take(1),
      catchError((reason: unknown) => {
        console.warn(
          `SpotsService: looking ${id} up in the bundled snapshot; the live spot failed:`,
          reason,
        );
        return snapshot;
      }),
    );
  }

  /**
   * A city's collection load through `rpc`, falling back to `snapshot` — the pipeline behind
   * {@link loadSpotList}; see the class comment for the rules.
   */
  private loadCollection<C extends { readonly features?: readonly unknown[] }>(
    city: CityEnum,
    rpc: 'city_spot_list',
    snapshot: Observable<CollectionLoadEvent<C>>,
  ): Observable<CollectionLoadEvent<C>> {
    if (!this.backend.apiUrl) {
      return snapshot;
    }
    const live = this.http
      .get<C>(`${this.backend.apiUrl}/rest/v1/rpc/${rpc}`, {
        params: { p_city: city },
        headers: this.apiHeaders(),
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map((event) => toLoadEvent(event, 'live')),
        filter((event): event is CollectionLoadEvent<C> => event !== null),
        map((event) => {
          if (
            event.type === 'done' &&
            (event.collection?.features?.length ?? 0) === 0
          ) {
            throw new Error(`the live database has no spots for ${city}`);
          }
          return event;
        }),
      );
    return merge(live, liveDeadline('the live spots')).pipe(
      takeWhile((event) => event.type !== 'done', true),
      catchError((reason: unknown) => {
        console.warn(
          `SpotsService: serving the bundled snapshot for ${city}; the live spots failed:`,
          reason,
        );
        return concat(of({ type: 'fallback' } as const), snapshot);
      }),
    );
  }

  /** The bundled snapshot's milestones, base-relative: production is served under /spotmap-website/. */
  private snapshotEvents(
    city: CityEnum,
  ): Observable<CollectionLoadEvent<SpotCollection>> {
    return this.http
      .get<SpotCollection>(`spots/${city}.geojson`, {
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map((event) => toLoadEvent(event, 'snapshot')),
        filter(
          (event): event is CollectionLoadEvent<SpotCollection> =>
            event !== null,
        ),
      );
  }

  /**
   * One spot looked up in the bundled snapshots: its city from {@link SPOT_INDEX_URL}, then the
   * spot from that city's snapshot. An id in neither is `not-found`; a failed request errors.
   */
  private snapshotDetail(id: string): Observable<SpotDetailResult> {
    return this.http.get<Record<string, string>>(SPOT_INDEX_URL).pipe(
      mergeMap((index) => {
        // Own keys only: an id such as `toString` must not resolve through the prototype.
        if (!Object.hasOwn(index, id)) {
          return of<SpotDetailResult>({ type: 'not-found' });
        }
        const city = index[id];
        return this.http.get<SpotCollection>(`spots/${city}.geojson`).pipe(
          map((collection): SpotDetailResult => {
            const feature = collection.features.find(
              (candidate) => candidate.properties.id === id,
            );
            return feature
              ? {
                  type: 'found',
                  spot: toSpotDetail(feature, city),
                  source: 'snapshot',
                }
              : { type: 'not-found' };
          }),
        );
      }),
    );
  }

  /** The publishable key every live request carries. */
  private apiHeaders(): Record<string, string> {
    return { apikey: this.backend.publishableKey };
  }
}

/**
 * Errors once {@link LIVE_SPOTS_TIMEOUT_MS} have passed. `timeout()` restarts on every emission and
 * a collection request emits several, so the budget is one deadline merged over the whole
 * exchange, cut off with the stream once the response is in.
 *
 * @param what the request's name in the error message
 */
function liveDeadline(what: string): Observable<never> {
  return timer(LIVE_SPOTS_TIMEOUT_MS).pipe(
    mergeMap(() =>
      throwError(
        () => new Error(`${what} took longer than ${LIVE_SPOTS_TIMEOUT_MS} ms`),
      ),
    ),
  );
}

/**
 * The milestone an HTTP event stands for, or `null` for one that is none: download progress carries
 * no total here (the live endpoint sends no `Content-Length`), so it says nothing about how far along
 * the load is.
 */
function toLoadEvent<C>(
  event: HttpEvent<C>,
  source: 'live' | 'snapshot',
): CollectionLoadEvent<C> | null {
  switch (event.type) {
    case HttpEventType.Sent:
      return { type: 'sent' };
    case HttpEventType.ResponseHeader:
      return { type: 'headers' };
    case HttpEventType.Response:
      return { type: 'done', collection: event.body as C, source };
    default:
      return null;
  }
}
