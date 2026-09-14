import { HttpClient, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SpotCollection } from './spot';

describe('vienna.geojson pilot asset', () => {
  let collection: SpotCollection;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    collection = await firstValueFrom(
      TestBed.inject(HttpClient).get<SpotCollection>('spots/vienna.geojson'),
    );
  });

  it('is a FeatureCollection of at least 12 point features', () => {
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features.length).toBeGreaterThanOrEqual(12);
    for (const f of collection.features) {
      expect(f.geometry.type).toBe('Point');
      expect(f.geometry.coordinates.length).toBe(2);
      const [lng, lat] = f.geometry.coordinates;
      // Vienna's bounding box, generously drawn.
      expect(lng).toBeGreaterThan(16.1);
      expect(lng).toBeLessThan(16.6);
      expect(lat).toBeGreaterThan(48.1);
      expect(lat).toBeLessThan(48.35);
    }
  });

  it('gives every spot a unique id, a name and a known status', () => {
    const ids = collection.features.map((f) => f.properties.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of collection.features) {
      expect(f.properties.name.length).toBeGreaterThan(0);
      expect(['active', 'demolished', 'unclassified']).toContain(
        f.properties.status,
      );
    }
  });

  it('includes at least 3 demolished spots so the ghosted pin state has real data', () => {
    const gone = collection.features.filter(
      (f) => f.properties.status === 'demolished',
    );
    expect(gone.length).toBeGreaterThanOrEqual(3);
  });

  it('gives exactly 2 spots a multi-photo set so the gallery has real data', () => {
    const multi = collection.features.filter(
      (f) => f.properties.photos.length > 1,
    );
    expect(multi.length).toBe(2);
  });

  it('references every photo base-relative, and every file resolves', async () => {
    const http = TestBed.inject(HttpClient);
    for (const f of collection.features) {
      expect(f.properties.photos.length).toBeGreaterThan(0);
      for (const photo of f.properties.photos) {
        expect(photo.startsWith('/'))
          .withContext(`${photo} must be base-relative for GitHub Pages`)
          .toBe(false);
        expect(photo.startsWith('spots/vienna/')).toBe(true);
        const blob = await firstValueFrom(
          http.get(photo, { responseType: 'blob' }),
        );
        expect(blob.size).toBeGreaterThan(0);
      }
    }
  });
});
