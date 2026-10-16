import { HttpHeaderResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { CityEnum } from '../models/enums/map-enum';
import { SpotCollection } from '../models/spots/spot';
import { SPOTMAP_BACKEND, SpotmapBackend } from './spotmap-backend';
import {
  LIVE_SPOTS_TIMEOUT_MS,
  SpotsLoadEvent,
  SpotsService,
} from './spots.service';

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

  /** Subscribes and records every event and the error, if any. */
  function record(city = CityEnum.Vienna) {
    const events: SpotsLoadEvent[] = [];
    let error: unknown;
    service.loadSpots(city).subscribe({
      next: (event) => events.push(event),
      error: (reason) => (error = reason),
    });
    return { events, error: () => error };
  }

  afterEach(() => httpMock.verify());

  describe('without a backend', () => {
    beforeEach(() => setUp());

    it('requests the city asset with a base-relative url', () => {
      const { events } = record();
      const req = httpMock.expectOne('spots/vienna.geojson');
      expect(req.request.url.startsWith('/')).toBe(false);
      req.flush(SNAPSHOT);
      expect(events.map((e) => e.type)).toEqual(['sent', 'done']);
      expect(events[1]).toEqual({
        type: 'done',
        collection: SNAPSHOT,
        source: 'snapshot',
      });
    });

    it('surfaces a transport failure to the caller', () => {
      const { events, error } = record();
      httpMock
        .expectOne('spots/vienna.geojson')
        .flush('missing', { status: 404, statusText: 'Not Found' });
      expect(events.map((e) => e.type)).toEqual(['sent']);
      expect((error() as { status: number }).status).toBe(404);
    });
  });

  describe('with a backend', () => {
    beforeEach(() => {
      setUp(BACKEND);
      spyOn(console, 'warn');
    });

    it('serves the live spots and never touches the snapshot', () => {
      const { events } = record();
      expectLive().flush(LIVE);
      expect(events.at(-1)).toEqual({
        type: 'done',
        collection: LIVE,
        source: 'live',
      });
      httpMock.expectNone('spots/vienna.geojson');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('falls back to the snapshot when the live request fails', () => {
      const { events } = record();
      expectLive().flush('{"message":"unknown city"}', {
        status: 400,
        statusText: 'Bad Request',
      });
      httpMock.expectOne('spots/vienna.geojson').flush(SNAPSHOT);
      expect(events.at(-1)).toEqual({
        type: 'done',
        collection: SNAPSHOT,
        source: 'snapshot',
      });
      expect(console.warn).toHaveBeenCalled();
    });

    it('falls back to the snapshot when the live request takes too long', fakeAsync(() => {
      const { events } = record();
      const live = expectLive();
      tick(LIVE_SPOTS_TIMEOUT_MS);
      expect(live.cancelled).toBeTrue();
      httpMock.expectOne('spots/vienna.geojson').flush(SNAPSHOT);
      expect(events.at(-1)).toEqual({
        type: 'done',
        collection: SNAPSHOT,
        source: 'snapshot',
      });
    }));

    it('falls back to the snapshot when the live answer has no spots', () => {
      const { events } = record();
      expectLive().flush({ type: 'FeatureCollection', features: [] });
      httpMock.expectOne('spots/vienna.geojson').flush(SNAPSHOT);
      expect(events.at(-1)).toEqual({
        type: 'done',
        collection: SNAPSHOT,
        source: 'snapshot',
      });
    });

    it('surfaces the snapshot failure when both sources fail', () => {
      const { events, error } = record();
      expectLive().flush('down', { status: 503, statusText: 'Unavailable' });
      httpMock
        .expectOne('spots/vienna.geojson')
        .flush('missing', { status: 404, statusText: 'Not Found' });
      expect(events.map((e) => e.type)).toEqual(['sent', 'fallback', 'sent']);
      expect((error() as { status: number }).status).toBe(404);
    });

    it('reports the live request, its headers and the collection', () => {
      const { events } = record();
      const live = expectLive();
      live.event(new HttpHeaderResponse({ status: 200 }));
      live.flush(LIVE);
      expect(events.map((e) => e.type)).toEqual(['sent', 'headers', 'done']);
      expect(events[2]).toEqual({
        type: 'done',
        collection: LIVE,
        source: 'live',
      });
    });

    it('falls back with a fallback event, then reports the snapshot from its own request', () => {
      const { events } = record();
      expectLive().flush(null, {
        status: 503,
        statusText: 'Service Unavailable',
      });
      httpMock.expectOne('spots/vienna.geojson').flush(SNAPSHOT);
      expect(events.map((e) => e.type)).toEqual([
        'sent',
        'fallback',
        'sent',
        'done',
      ]);
      expect(events[3]).toEqual({
        type: 'done',
        collection: SNAPSHOT,
        source: 'snapshot',
      });
    });

    it('holds the live request to five seconds in total, however many events it sends', fakeAsync(() => {
      const { events } = record();
      const live = expectLive();
      tick(LIVE_SPOTS_TIMEOUT_MS - 1);
      live.event(new HttpHeaderResponse({ status: 200 }));
      tick(1);
      expect(live.cancelled).toBeTrue();
      httpMock.expectOne('spots/vienna.geojson').flush(SNAPSHOT);
      expect(events.map((e) => e.type)).toEqual([
        'sent',
        'headers',
        'fallback',
        'sent',
        'done',
      ]);
    }));

    it('does not time out a live answer that arrived in time', fakeAsync(() => {
      const { events, error } = record();
      expectLive().flush(LIVE);
      tick(LIVE_SPOTS_TIMEOUT_MS * 2);
      expect(error()).toBeUndefined();
      expect(events.at(-1)?.type).toBe('done');
      httpMock.expectNone('spots/vienna.geojson');
    }));

    it('asks the live database again on every load, so a retry tries it first', () => {
      service.loadSpots(CityEnum.Vienna).subscribe();
      expectLive().flush(LIVE);
      service.loadSpots(CityEnum.Vienna).subscribe();
      expectLive().flush(LIVE);
    });
  });
});
