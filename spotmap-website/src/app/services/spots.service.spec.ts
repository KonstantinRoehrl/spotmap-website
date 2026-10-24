import { HttpHeaderResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { CityEnum } from '../models/enums/map-enum';
import {
  SpotCollection,
  SpotDetail,
  SpotListCollection,
} from '../models/spots/spot';
import { SPOTMAP_BACKEND, SpotmapBackend } from './spotmap-backend';
import {
  LIVE_SPOTS_TIMEOUT_MS,
  SPOT_INDEX_URL,
  SpotDetailResult,
  SpotListLoadEvent,
  SpotsService,
} from './spots.service';

const BACKEND: SpotmapBackend = {
  apiUrl: 'https://api.test',
  publishableKey: 'sb_publishable_test', // gitleaks:allow
  photoBaseUrl: 'https://api.test/storage/v1/object/public/spot-photos',
};

const LIST_URL = 'https://api.test/rest/v1/rpc/city_spot_list';
const DETAIL_URL = 'https://api.test/rest/v1/rpc/spot_detail';

/** The live list answer for Vienna. */
const LIVE_LIST: SpotListCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.37, 48.2] },
      properties: {
        id: 'live',
        name: 'Live',
        status: 'active',
        cover: 'vienna/live-1.webp',
        photoCount: 1,
      },
    },
  ],
};

/** Vienna's bundled snapshot as the detail and list specs serve it: one spot with photos, one without. */
const CITY_SNAPSHOT: SpotCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.38, 48.18] },
      properties: {
        id: 'h-1',
        name: 'Hbf Curb',
        status: 'active',
        notes: 'bring wax',
        photos: ['vienna/h-1-1.webp', 'vienna/h-1-2.webp'],
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.4, 48.22] },
      properties: {
        id: 'g-2',
        name: 'Gone',
        status: 'demolished',
        notes: null,
        photos: [],
      },
    },
  ],
};

/** {@link CITY_SNAPSHOT} in the list shape, written out by hand. */
const CITY_SNAPSHOT_LIST: SpotListCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.38, 48.18] },
      properties: {
        id: 'h-1',
        name: 'Hbf Curb',
        status: 'active',
        cover: 'vienna/h-1-1.webp',
        photoCount: 2,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.4, 48.22] },
      properties: {
        id: 'g-2',
        name: 'Gone',
        status: 'demolished',
        cover: null,
        photoCount: 0,
      },
    },
  ],
};

/** The live detail answer for `h-1`. */
const LIVE_DETAIL: SpotDetail = {
  id: 'h-1',
  city: 'vienna',
  name: 'Hbf Curb',
  status: 'active',
  notes: 'bring wax',
  photos: ['vienna/h-1-1.webp', 'vienna/h-1-2.webp'],
  coordinates: [16.38, 48.18],
};

/** `h-1` as the snapshot path derives it from {@link CITY_SNAPSHOT}. */
const SNAPSHOT_DETAIL: SpotDetail = { ...LIVE_DETAIL };

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

  afterEach(() => httpMock.verify());

  /** The one live list request for Vienna, checked for its query and key. */
  function expectLiveList(): TestRequest {
    const req = httpMock.expectOne((r) => r.url === LIST_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('p_city')).toBe('vienna');
    expect(req.request.headers.get('apikey')).toBe(BACKEND.publishableKey);
    return req;
  }

  /** Subscribes to the list load and records every event and the error, if any. */
  function recordList(city = CityEnum.Vienna) {
    const events: SpotListLoadEvent[] = [];
    let error: unknown;
    service.loadSpotList(city).subscribe({
      next: (event) => events.push(event),
      error: (reason) => (error = reason),
    });
    return { events, error: () => error };
  }

  /** The one live detail request for `id`, checked for its query and key. */
  function expectLiveDetail(id = 'h-1'): TestRequest {
    const req = httpMock.expectOne((r) => r.url === DETAIL_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('p_id')).toBe(id);
    expect(req.request.headers.get('apikey')).toBe(BACKEND.publishableKey);
    return req;
  }

  /** Subscribes to the detail load and records its answers, whether it completed, and its error. */
  function recordDetail(id = 'h-1') {
    const results: SpotDetailResult[] = [];
    let completed = false;
    let error: unknown;
    service.loadSpotDetail(id).subscribe({
      next: (result) => results.push(result),
      complete: () => (completed = true),
      error: (reason) => (error = reason),
    });
    return { results, completed: () => completed, error: () => error };
  }

  describe('loadSpotList without a backend', () => {
    beforeEach(() => setUp());

    it('maps the bundled full-shape snapshot to the list shape', () => {
      const { events } = recordList();
      httpMock.expectOne('spots/vienna.geojson').flush(CITY_SNAPSHOT);
      expect(events.map((e) => e.type)).toEqual(['sent', 'done']);
      expect(events[1]).toEqual({
        type: 'done',
        collection: CITY_SNAPSHOT_LIST,
        source: 'snapshot',
      });
    });

    it('surfaces a transport failure to the caller', () => {
      const { events, error } = recordList();
      httpMock
        .expectOne('spots/vienna.geojson')
        .flush('missing', { status: 404, statusText: 'Not Found' });
      expect(events.map((e) => e.type)).toEqual(['sent']);
      expect((error() as { status: number }).status).toBe(404);
    });
  });

  describe('loadSpotList with a backend', () => {
    beforeEach(() => {
      setUp(BACKEND);
      spyOn(console, 'warn');
    });

    it('serves the live list with its milestones and never touches the snapshot', () => {
      const { events } = recordList();
      const live = expectLiveList();
      live.event(new HttpHeaderResponse({ status: 200 }));
      live.flush(LIVE_LIST);
      expect(events).toEqual([
        { type: 'sent' },
        { type: 'headers' },
        { type: 'done', collection: LIVE_LIST, source: 'live' },
      ]);
      httpMock.expectNone('spots/vienna.geojson');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('falls back with a fallback event to the snapshot, in the list shape, when the live request fails', () => {
      const { events } = recordList();
      expectLiveList().flush('down', {
        status: 503,
        statusText: 'Unavailable',
      });
      httpMock.expectOne('spots/vienna.geojson').flush(CITY_SNAPSHOT);
      expect(events.map((e) => e.type)).toEqual([
        'sent',
        'fallback',
        'sent',
        'done',
      ]);
      expect(events.at(-1)).toEqual({
        type: 'done',
        collection: CITY_SNAPSHOT_LIST,
        source: 'snapshot',
      });
      expect(console.warn).toHaveBeenCalled();
    });

    it('falls back when the live answer has no spots', () => {
      const { events } = recordList();
      expectLiveList().flush({ type: 'FeatureCollection', features: [] });
      httpMock.expectOne('spots/vienna.geojson').flush(CITY_SNAPSHOT);
      expect(events.at(-1)).toEqual({
        type: 'done',
        collection: CITY_SNAPSHOT_LIST,
        source: 'snapshot',
      });
    });

    it('holds the live list to the same deadline over the whole exchange', fakeAsync(() => {
      const { events } = recordList();
      const live = expectLiveList();
      tick(LIVE_SPOTS_TIMEOUT_MS - 1);
      live.event(new HttpHeaderResponse({ status: 200 }));
      tick(1);
      expect(live.cancelled).toBeTrue();
      httpMock.expectOne('spots/vienna.geojson').flush(CITY_SNAPSHOT);
      expect(events.map((e) => e.type)).toEqual([
        'sent',
        'headers',
        'fallback',
        'sent',
        'done',
      ]);
    }));

    it('does not time out a live list that arrived in time', fakeAsync(() => {
      const { events, error } = recordList();
      expectLiveList().flush(LIVE_LIST);
      tick(LIVE_SPOTS_TIMEOUT_MS * 2);
      expect(error()).toBeUndefined();
      expect(events.at(-1)?.type).toBe('done');
    }));

    it('surfaces the snapshot failure when both sources fail', () => {
      const { error } = recordList();
      expectLiveList().flush('down', {
        status: 503,
        statusText: 'Unavailable',
      });
      httpMock
        .expectOne('spots/vienna.geojson')
        .flush('missing', { status: 404, statusText: 'Not Found' });
      expect((error() as { status: number }).status).toBe(404);
    });
  });

  describe('loadSpotDetail without a backend', () => {
    beforeEach(() => setUp());

    it('looks the spot up through the bundled index and its city’s snapshot', () => {
      const { results, completed } = recordDetail();
      httpMock.expectOne(SPOT_INDEX_URL).flush({ 'h-1': 'vienna' });
      httpMock.expectOne('spots/vienna.geojson').flush(CITY_SNAPSHOT);
      expect(results).toEqual([
        { type: 'found', spot: SNAPSHOT_DETAIL, source: 'snapshot' },
      ]);
      expect(completed()).toBeTrue();
    });

    it('answers not-found for an id the index does not hold, without fetching a city', () => {
      const { results, completed } = recordDetail('nope');
      httpMock.expectOne(SPOT_INDEX_URL).flush({ 'h-1': 'vienna' });
      httpMock.expectNone('spots/vienna.geojson');
      expect(results).toEqual([{ type: 'not-found' }]);
      expect(completed()).toBeTrue();
    });

    it('answers not-found for an index entry inherited from an object prototype', () => {
      const { results } = recordDetail('toString');
      httpMock.expectOne(SPOT_INDEX_URL).flush({ 'h-1': 'vienna' });
      expect(results).toEqual([{ type: 'not-found' }]);
    });

    it('answers not-found when the city’s snapshot no longer holds the id', () => {
      const { results } = recordDetail('h-9');
      httpMock.expectOne(SPOT_INDEX_URL).flush({ 'h-9': 'vienna' });
      httpMock.expectOne('spots/vienna.geojson').flush(CITY_SNAPSHOT);
      expect(results).toEqual([{ type: 'not-found' }]);
    });

    it('surfaces a failed index request to the caller', () => {
      const { results, error } = recordDetail();
      httpMock
        .expectOne(SPOT_INDEX_URL)
        .flush('missing', { status: 404, statusText: 'Not Found' });
      expect(results).toEqual([]);
      expect((error() as { status: number }).status).toBe(404);
    });

    it('surfaces a failed city snapshot request to the caller', () => {
      const { error } = recordDetail();
      httpMock.expectOne(SPOT_INDEX_URL).flush({ 'h-1': 'vienna' });
      httpMock
        .expectOne('spots/vienna.geojson')
        .flush('missing', { status: 404, statusText: 'Not Found' });
      expect((error() as { status: number }).status).toBe(404);
    });
  });

  describe('loadSpotDetail with a backend', () => {
    beforeEach(() => {
      setUp(BACKEND);
      spyOn(console, 'warn');
    });

    it('serves the live detail once and never touches the snapshot', () => {
      const { results, completed } = recordDetail();
      expectLiveDetail().flush(LIVE_DETAIL);
      expect(results).toEqual([
        { type: 'found', spot: LIVE_DETAIL, source: 'live' },
      ]);
      expect(completed()).toBeTrue();
      httpMock.expectNone(SPOT_INDEX_URL);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('takes a live null as final: not found, with no snapshot lookup', () => {
      const { results, completed } = recordDetail();
      expectLiveDetail().flush(null);
      expect(results).toEqual([{ type: 'not-found' }]);
      expect(completed()).toBeTrue();
      httpMock.expectNone(SPOT_INDEX_URL);
    });

    it('falls back to the snapshot when the live request fails', () => {
      const { results } = recordDetail();
      expectLiveDetail().flush('down', {
        status: 503,
        statusText: 'Unavailable',
      });
      httpMock.expectOne(SPOT_INDEX_URL).flush({ 'h-1': 'vienna' });
      httpMock.expectOne('spots/vienna.geojson').flush(CITY_SNAPSHOT);
      expect(results).toEqual([
        { type: 'found', spot: SNAPSHOT_DETAIL, source: 'snapshot' },
      ]);
      expect(console.warn).toHaveBeenCalled();
    });

    it('answers not-found from the snapshot when the live request failed and the index lacks the id', () => {
      const { results } = recordDetail('nope');
      expectLiveDetail('nope').flush('down', {
        status: 503,
        statusText: 'Unavailable',
      });
      httpMock.expectOne(SPOT_INDEX_URL).flush({ 'h-1': 'vienna' });
      expect(results).toEqual([{ type: 'not-found' }]);
    });

    it('falls back to the snapshot when the live request takes too long', fakeAsync(() => {
      const { results } = recordDetail();
      const live = expectLiveDetail();
      tick(LIVE_SPOTS_TIMEOUT_MS);
      expect(live.cancelled).toBeTrue();
      httpMock.expectOne(SPOT_INDEX_URL).flush({ 'h-1': 'vienna' });
      httpMock.expectOne('spots/vienna.geojson').flush(CITY_SNAPSHOT);
      expect(results).toEqual([
        { type: 'found', spot: SNAPSHOT_DETAIL, source: 'snapshot' },
      ]);
    }));

    it('does not time out a live detail that arrived in time', fakeAsync(() => {
      const { results, error } = recordDetail();
      expectLiveDetail().flush(LIVE_DETAIL);
      tick(LIVE_SPOTS_TIMEOUT_MS * 2);
      expect(error()).toBeUndefined();
      expect(results.length).toBe(1);
      httpMock.expectNone(SPOT_INDEX_URL);
    }));
  });
});
