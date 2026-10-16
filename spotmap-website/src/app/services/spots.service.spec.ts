import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { CityEnum } from '../models/enums/map-enum';
import { SpotCollection } from '../models/spots/spot';
import { SPOTMAP_BACKEND, SpotmapBackend } from './spotmap-backend';
import { LIVE_SPOTS_TIMEOUT_MS, SpotsService } from './spots.service';

const LIVE_URL = 'https://api.test/rest/v1/rpc/city_spots';

const BACKEND: SpotmapBackend = {
  apiUrl: 'https://api.test',
  publishableKey: 'sb_publishable_test', // gitleaks:allow
  photoBaseUrl: 'https://api.test/storage/v1/object/public/spot-photos',
};

const LIVE: SpotCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.37, 48.2] },
      properties: {
        id: 'live',
        name: 'Live',
        status: 'active',
        notes: null,
        photos: [],
      },
    },
  ],
};

const SNAPSHOT: SpotCollection = {
  type: 'FeatureCollection',
  features: [
    {
      ...LIVE.features[0],
      properties: { ...LIVE.features[0].properties, id: 'snapshot' },
    },
  ],
};

describe('SpotsService', () => {
  let service: SpotsService;
  let httpMock: HttpTestingController;

  function setUp(backend?: SpotmapBackend) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...(backend ? [{ provide: SPOTMAP_BACKEND, useValue: backend }] : []),
      ],
    });
    service = TestBed.inject(SpotsService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  /** The one live request for Vienna, checked for its query and key. */
  function expectLive(): TestRequest {
    const req = httpMock.expectOne((r) => r.url === LIVE_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('p_city')).toBe('vienna');
    expect(req.request.headers.get('apikey')).toBe(BACKEND.publishableKey);
    return req;
  }

  afterEach(() => httpMock.verify());

  describe('without a backend', () => {
    beforeEach(() => setUp());

    it('requests the city asset with a base-relative url', () => {
      service.loadSpots(CityEnum.Vienna).subscribe();
      const req = httpMock.expectOne('spots/vienna.geojson');
      expect(req.request.url.startsWith('/')).toBe(false);
      req.flush({ type: 'FeatureCollection', features: [] });
    });

    it('surfaces a transport failure to the caller', (done) => {
      service.loadSpots(CityEnum.Vienna).subscribe({
        next: () => done.fail('expected an error'),
        error: (err) => {
          expect(err.status).toBe(404);
          done();
        },
      });
      httpMock
        .expectOne('spots/vienna.geojson')
        .flush('missing', { status: 404, statusText: 'Not Found' });
    });
  });

  describe('with a backend', () => {
    beforeEach(() => {
      setUp(BACKEND);
      spyOn(console, 'warn');
    });

    it('serves the live spots and never touches the snapshot', () => {
      let result: SpotCollection | undefined;
      service.loadSpots(CityEnum.Vienna).subscribe((c) => (result = c));
      expectLive().flush(LIVE);
      expect(result).toEqual(LIVE);
      httpMock.expectNone('spots/vienna.geojson');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('falls back to the snapshot when the live request fails', () => {
      let result: SpotCollection | undefined;
      service.loadSpots(CityEnum.Vienna).subscribe((c) => (result = c));
      expectLive().flush('{"message":"unknown city"}', {
        status: 400,
        statusText: 'Bad Request',
      });
      httpMock.expectOne('spots/vienna.geojson').flush(SNAPSHOT);
      expect(result).toEqual(SNAPSHOT);
      expect(console.warn).toHaveBeenCalled();
    });

    it('falls back to the snapshot when the live request takes too long', fakeAsync(() => {
      let result: SpotCollection | undefined;
      service.loadSpots(CityEnum.Vienna).subscribe((c) => (result = c));
      const live = expectLive();
      tick(LIVE_SPOTS_TIMEOUT_MS);
      expect(live.cancelled).toBeTrue();
      httpMock.expectOne('spots/vienna.geojson').flush(SNAPSHOT);
      expect(result).toEqual(SNAPSHOT);
    }));

    it('falls back to the snapshot when the live answer has no spots', () => {
      let result: SpotCollection | undefined;
      service.loadSpots(CityEnum.Vienna).subscribe((c) => (result = c));
      expectLive().flush({ type: 'FeatureCollection', features: [] });
      httpMock.expectOne('spots/vienna.geojson').flush(SNAPSHOT);
      expect(result).toEqual(SNAPSHOT);
    });

    it('surfaces the snapshot failure when both sources fail', (done) => {
      service.loadSpots(CityEnum.Vienna).subscribe({
        next: () => done.fail('expected an error'),
        error: (err) => {
          expect(err.status).toBe(404);
          done();
        },
      });
      expectLive().flush('down', { status: 503, statusText: 'Unavailable' });
      httpMock
        .expectOne('spots/vienna.geojson')
        .flush('missing', { status: 404, statusText: 'Not Found' });
    });

    it('asks the live database again on every load, so a retry tries it first', () => {
      service.loadSpots(CityEnum.Vienna).subscribe();
      expectLive().flush(LIVE);
      service.loadSpots(CityEnum.Vienna).subscribe();
      expectLive().flush(LIVE);
    });
  });
});
