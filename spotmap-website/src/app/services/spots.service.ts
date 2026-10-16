import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, timeout } from 'rxjs';
import { CityEnum } from '../models/enums/map-enum';
import { SpotCollection } from '../models/spots/spot';
import { SPOTMAP_BACKEND } from './spotmap-backend';

/** How long the live query may take before the map falls back to the bundled snapshot. */
export const LIVE_SPOTS_TIMEOUT_MS = 5000;

/**
 * Loads a city's spots: live from the Supabase `city_spots()` query when a backend is
 * configured, otherwise — or when the live request fails, times out, or answers with no spots —
 * from the bundled `spots/<city>.geojson` snapshot, which carries the same shape. Every city has
 * spots, so an empty live answer means an unseeded or out-of-date backend, not an empty city. A
 * snapshot failure reaches the caller (the map's error state and its RETRY, which asks live
 * first again).
 */
@Injectable({ providedIn: 'root' })
export class SpotsService {
  private readonly http = inject(HttpClient);
  private readonly backend = inject(SPOTMAP_BACKEND);

  /** The city's spots, live first; see the class comment for the fallback rules. */
  loadSpots(city: CityEnum): Observable<SpotCollection> {
    const snapshot = this.loadSnapshot(city);
    if (!this.backend.apiUrl) {
      return snapshot;
    }
    return this.http
      .get<SpotCollection>(`${this.backend.apiUrl}/rest/v1/rpc/city_spots`, {
        params: { p_city: city },
        headers: { apikey: this.backend.publishableKey },
      })
      .pipe(
        timeout(LIVE_SPOTS_TIMEOUT_MS),
        map((collection) => {
          if ((collection?.features?.length ?? 0) === 0) {
            throw new Error(`the live database has no spots for ${city}`);
          }
          return collection;
        }),
        catchError((reason: unknown) => {
          console.warn(
            `SpotsService: serving the bundled snapshot for ${city}; the live spots failed:`,
            reason,
          );
          return snapshot;
        }),
      );
  }

  /** The bundled snapshot, base-relative: production is served under /spotmap-website/. */
  private loadSnapshot(city: CityEnum): Observable<SpotCollection> {
    return this.http.get<SpotCollection>(`spots/${city}.geojson`);
  }
}
