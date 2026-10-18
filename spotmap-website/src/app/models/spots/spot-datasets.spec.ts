import { HttpClient, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SUPPORTED_CITIES } from '../enums/config';
import { CityEnum } from '../enums/map-enum';
import { SpotCollection, SpotStatus } from './spot';

const STATUSES: SpotStatus[] = ['active', 'demolished'];

/**
 * Every city's served dataset, `public/spots/<city>.geojson`, is exported from the database by
 * `npm run snapshot:supabase`. Each one loads the way SpotsService loads it and holds what
 * SpotMapComponent and SpotPopupComponent rely on. Photos are object keys of the city's own photos, never URLs.
 */
describe('served spot datasets', () => {
  for (const city of Object.keys(SUPPORTED_CITIES) as CityEnum[]) {
    describe(`spots/${city}.geojson`, () => {
      let collection: SpotCollection;

      beforeEach(async () => {
        TestBed.configureTestingModule({ providers: [provideHttpClient()] });
        collection = await firstValueFrom(
          TestBed.inject(HttpClient).get<SpotCollection>(
            `spots/${city}.geojson`,
          ),
        );
      });

      it('is a FeatureCollection of point features at finite lng/lat', () => {
        expect(collection.type).toBe('FeatureCollection');
        expect(collection.features.length).toBeGreaterThan(0);
        for (const f of collection.features) {
          expect(f.geometry.type).toBe('Point');
          expect(f.geometry.coordinates.length).toBe(2);
          const [lng, lat] = f.geometry.coordinates;
          expect(Number.isFinite(lng) && lng >= -180 && lng <= 180)
            .withContext(`${f.properties.id} longitude ${lng}`)
            .toBe(true);
          expect(Number.isFinite(lat) && lat >= -90 && lat <= 90)
            .withContext(`${f.properties.id} latitude ${lat}`)
            .toBe(true);
        }
      });

      it('gives every spot a unique id, a name and a known status', () => {
        const ids = collection.features.map((f) => f.properties.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const f of collection.features) {
          expect(f.properties.name.length).toBeGreaterThan(0);
          expect(STATUSES).toContain(f.properties.status);
        }
      });

      it('serves notes and photo keys of its own city, and no source records', () => {
        const photoKey = new RegExp(`^${city}/[^/]+\\.webp$`);
        for (const f of collection.features) {
          const { notes, photos } = f.properties;
          expect(notes === null || notes.trim().length > 0)
            .withContext(`${f.properties.id} notes`)
            .toBe(true);
          for (const key of photos) {
            expect(key).withContext(f.properties.id).toMatch(photoKey);
          }
          expect('sources' in f.properties)
            .withContext(f.properties.id)
            .toBe(false);
        }
      });
    });
  }
});
