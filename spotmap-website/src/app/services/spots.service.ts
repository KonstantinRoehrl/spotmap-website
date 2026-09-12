import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CityEnum } from '../models/enums/map-enum';
import { SpotCollection } from '../models/spots/spot';

/**
 * Loads a city's spot set. The static asset behind this is the seam a later phase replaces
 * with a live query — callers see a SpotCollection either way.
 */
@Injectable({ providedIn: 'root' })
export class SpotsService {
  private readonly http = inject(HttpClient);

  loadSpots(city: CityEnum): Observable<SpotCollection> {
    // Base-relative: production is served under /spotmap-website/ and a leading slash would 404 there.
    return this.http.get<SpotCollection>(`spots/${city}.geojson`);
  }
}
