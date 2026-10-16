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
  takeWhile,
  throwError,
  timer,
} from 'rxjs';
import { CityEnum } from '../models/enums/map-enum';
import { SpotCollection } from '../models/spots/spot';
import { SPOTMAP_BACKEND } from './spotmap-backend';

/** How long the live query may take, in total, before the map falls back to the bundled snapshot. */
export const LIVE_SPOTS_TIMEOUT_MS = 5000;

/** The last event of a spot load: the collection, and whether it came live or from the snapshot. */
export interface SpotsLoaded {
  readonly type: 'done';
  readonly collection: SpotCollection;
  readonly source: 'live' | 'snapshot';
}

/**
 * One real milestone of a spot load, for the loader's progress: a request went out, its response
 * headers arrived, the live query gave up for the snapshot, or the spots are in.
 */
export type SpotsLoadEvent =
  | { readonly type: 'sent' }
  | { readonly type: 'headers' }
  | { readonly type: 'fallback' }
  | SpotsLoaded;

/**
 * Loads a city's spots: live from the Supabase `city_spots()` query when a backend is configured,
 * otherwise — or when the live request fails, takes longer than {@link LIVE_SPOTS_TIMEOUT_MS} in
 * total, or answers with no spots — from the bundled `spots/<city>.geojson` snapshot, which carries
 * the same shape. Every city has spots, so an empty live answer means an unseeded or out-of-date
 * backend, not an empty city. A snapshot failure reaches the caller (the map's error state and its
 * RETRY, which asks live first again).
 */
@Injectable({ providedIn: 'root' })
export class SpotsService {
  private readonly http = inject(HttpClient);
  private readonly backend = inject(SPOTMAP_BACKEND);

  /**
   * The city's spot load as milestones ending in one {@link SpotsLoaded}; see the class comment for
   * the fallback rules.
   */
  loadSpots(city: CityEnum): Observable<SpotsLoadEvent> {
    const snapshot = this.loadSnapshot(city);
    if (!this.backend.apiUrl) {
      return snapshot;
    }
    const live = this.http
      .get<SpotCollection>(`${this.backend.apiUrl}/rest/v1/rpc/city_spots`, {
        params: { p_city: city },
        headers: { apikey: this.backend.publishableKey },
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map((event) => toLoadEvent(event, 'live')),
        filter((event): event is SpotsLoadEvent => event !== null),
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
    // `timeout()` restarts on every emission and the request now emits several, so the budget is
    // one deadline over the whole exchange, cut off with the stream once the response is in.
    const deadline = timer(LIVE_SPOTS_TIMEOUT_MS).pipe(
      mergeMap(() =>
        throwError(
          () =>
            new Error(
              `the live spots took longer than ${LIVE_SPOTS_TIMEOUT_MS} ms`,
            ),
        ),
      ),
    );
    return merge(live, deadline).pipe(
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

  /** The bundled snapshot, base-relative: production is served under /spotmap-website/. */
  private loadSnapshot(city: CityEnum): Observable<SpotsLoadEvent> {
    return this.http
      .get<SpotCollection>(`spots/${city}.geojson`, {
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map((event) => toLoadEvent(event, 'snapshot')),
        filter((event): event is SpotsLoadEvent => event !== null),
      );
  }
}

/**
 * The milestone an HTTP event stands for, or `null` for one that is none: download progress carries
 * no total here (the live endpoint sends no `Content-Length`), so it says nothing about how far along
 * the load is.
 */
function toLoadEvent(
  event: HttpEvent<SpotCollection>,
  source: SpotsLoaded['source'],
): SpotsLoadEvent | null {
  switch (event.type) {
    case HttpEventType.Sent:
      return { type: 'sent' };
    case HttpEventType.ResponseHeader:
      return { type: 'headers' };
    case HttpEventType.Response:
      return { type: 'done', collection: event.body as SpotCollection, source };
    default:
      return null;
  }
}
