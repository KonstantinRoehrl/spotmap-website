import { Location } from '@angular/common';
import { provideLocationMocks, SpyLocation } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';

import { CityEnum } from '../../../models/enums/map-enum';
import {
  SPOT_FOCUS_ZOOM,
  type ViewBounds,
} from '../../../models/map/map-camera';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import type {
  SpotDetail,
  SpotListCollection,
  SpotListFeature,
} from '../../../models/spots/spot';
import {
  SpotDetailResult,
  SpotListLoadEvent,
  SpotsService,
} from '../../../services/spots.service';
import { matchMapPage } from '../../../utils/map-page-path';
import { USER_CITY_STORAGE_KEY } from './stored-city';
import { DOCUMENT_TITLE_SUFFIX, SpotBrowserStore } from './spot-browser.store';

/** The map page as the router sees it: one routed component that provides the store. */
@Component({ template: '', providers: [SpotBrowserStore] })
class StoreHostComponent {}

/** Any other page, to leave the map page by. */
@Component({ template: '' })
class OtherPageComponent {}

/** A list-shape feature with one photo. */
function listFeature(
  id: string,
  name: string,
  coordinates: [number, number],
): SpotListFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      id,
      name,
      status: 'active',
      cover: `vienna/${id}-1.webp`,
      photoCount: 1,
    },
  };
}

/** A detail-shape spot. */
function spotDetail(
  id: string,
  city: string,
  name: string,
  coordinates: [number, number],
): SpotDetail {
  return {
    id,
    city,
    name,
    status: 'active',
    notes: null,
    photos: [`${city}/${id}-1.webp`],
    coordinates,
  };
}

const ALPHA = listFeature('a', 'Alpha Bank', [16.37, 48.2]);
const BETA = listFeature('b', 'Beta Ledge', [16.4, 48.22]);
/** Vienna's list, deliberately not A–Z, so the order the store shows is the in-view source's. */
const VIENNA_LIST: SpotListCollection = {
  type: 'FeatureCollection',
  features: [BETA, ALPHA],
};
/** A view holding both Vienna spots. */
const ALL_OF_VIENNA: ViewBounds = { west: 16, south: 48, east: 17, north: 49 };
/** A view holding neither. */
const EMPTY_CORNER: ViewBounds = {
  west: 10,
  south: 40,
  east: 10.01,
  north: 40.01,
};
const PAGE_TITLE = 'Spotmap Compendium';

describe('SpotBrowserStore', () => {
  /** The detail loads asked for, newest last per id; each answers when a spec says so. */
  let requests: Map<string, Subject<SpotDetailResult>>;
  let loadSpotDetail: jasmine.Spy;
  /** The list loads asked for, oldest first; each answers when a spec says so. */
  let listRequests: { city: CityEnum; request: Subject<SpotListLoadEvent> }[];
  let loadSpotList: jasmine.Spy;
  let harness: RouterTestingHarness;
  let store: SpotBrowserStore;
  let router: Router;
  let location: SpyLocation;
  let title: Title;

  beforeEach(() => {
    localStorage.removeItem(USER_CITY_STORAGE_KEY);
    requests = new Map();
    loadSpotDetail = jasmine
      .createSpy('loadSpotDetail')
      .and.callFake((id: string) => {
        const request = new Subject<SpotDetailResult>();
        requests.set(id, request);
        return request;
      });
    listRequests = [];
    loadSpotList = jasmine
      .createSpy('loadSpotList')
      .and.callFake((city: CityEnum) => {
        const request = new Subject<SpotListLoadEvent>();
        listRequests.push({ city, request });
        return request;
      });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { matcher: matchMapPage, component: StoreHostComponent },
          { path: 'home', component: OtherPageComponent },
        ]),
        provideLocationMocks(),
        { provide: SpotsService, useValue: { loadSpotDetail, loadSpotList } },
      ],
    });
    router = TestBed.inject(Router);
    location = TestBed.inject(Location) as SpyLocation;
    title = TestBed.inject(Title);
    title.setTitle(PAGE_TITLE);
  });

  afterEach(() => localStorage.removeItem(USER_CITY_STORAGE_KEY));

  /** Opens the map page on `url` and picks up the store its component provides. */
  async function openPage(url: string): Promise<void> {
    harness = await RouterTestingHarness.create(url);
    store = harness.routeDebugElement!.injector.get(SpotBrowserStore);
  }

  /** Lets a navigation the store started run to its end. */
  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }

  /** Answers the newest detail load of `id`. */
  function answer(id: string, result: SpotDetailResult): void {
    const request = requests.get(id)!;
    request.next(result);
    request.complete();
  }

  /** Fails the newest detail load of `id`, as when the live database and the snapshot are both down. */
  function failLoad(id: string): void {
    requests.get(id)!.error(new Error('no source answered'));
  }

  /** Answers the newest list load with `collection`. */
  function answerList(collection: SpotListCollection = VIENNA_LIST): void {
    const { request } = listRequests.at(-1)!;
    request.next({ type: 'done', collection, source: 'live' });
    request.complete();
  }

  /** The map page with Vienna's list loaded and the whole city in view. */
  async function openViennaMap(): Promise<void> {
    await openPage('/map');
    answerList();
    store.setBounds(ALL_OF_VIENNA);
  }

  /** The last history change the router made: a path, or `replace: <path>`. */
  function lastHistoryChange(): string {
    return location.urlChanges[location.urlChanges.length - 1];
  }

  it('reads the selection from the URL, on one page instance for /map and /spot/<id>', async () => {
    await openPage('/map');
    const page = harness.routeDebugElement!.componentInstance;
    expect(store.selectedId()).toBeNull();

    await harness.navigateByUrl('/spot/a');

    expect(harness.routeDebugElement!.componentInstance).toBe(page);
    expect(store.selectedId()).toBe('a');
  });

  it('shows the spots in view A–Z, and follows the bounds', async () => {
    await openViennaMap();
    expect(store.shownSpots()).toEqual([ALPHA, BETA]);

    store.setBounds(EMPTY_CORNER);
    expect(store.shownSpots()).toEqual([]);
  });

  it('shows nothing until both the list and the bounds are known', async () => {
    await openPage('/map');
    expect(store.shownSpots()).toBeNull();
    store.setBounds(ALL_OF_VIENNA);
    expect(store.shownSpots()).toBeNull();
    answerList();
    expect(store.shownSpots()).toEqual([ALPHA, BETA]);
  });

  it('lists every spot when the map that cannot paint reports the whole world as its view', async () => {
    // A map that never comes up reports no view of its own, so it stands in for one that holds
    // everything: the list must show the city rather than wait on a view that will never arrive.
    await openPage('/map');
    answerList();
    expect(store.shownSpots()).toBeNull();

    store.setBounds({ west: -180, south: -90, east: 180, north: 90 });

    expect(store.shownSpots()).toEqual([ALPHA, BETA]);
  });

  it('opens a spot from the list by pushing its link, and freezes the list', async () => {
    await openViennaMap();

    store.open('a', 'list');
    await settle();

    expect(router.url).toBe('/spot/a');
    expect(lastHistoryChange()).toBe('/spot/a');
    expect(store.returnFocusTo()).toBe('a');
    store.setBounds(EMPTY_CORNER);
    expect(store.shownSpots()).toEqual([ALPHA, BETA]);
  });

  it('remembers no row to return focus to when a pin opened the spot', async () => {
    await openViennaMap();
    store.open('b', 'pin');
    await settle();
    expect(store.returnFocusTo()).toBeNull();
  });

  it('shows what the list knows at once, then loads the full detail', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();

    expect(loadSpotDetail).toHaveBeenCalledOnceWith('a');
    expect(store.detail()).toEqual({
      status: 'loading',
      id: 'a',
      preview: ALPHA,
    });
    expect(title.getTitle()).toBe(`ALPHA BANK${DOCUMENT_TITLE_SUFFIX}`);

    const spot = spotDetail('a', 'vienna', 'Alpha Bank', [16.37, 48.2]);
    answer('a', { type: 'found', spot, source: 'live' });

    expect(store.detail()).toEqual({ status: 'loaded', id: 'a', spot });
    expect(store.mapCity()).toBe(CityEnum.Vienna);
    expect(store.openOn()).toBeNull();
  });

  it('switches from one open spot to another by replacing the link', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();

    store.open('b', 'pin');
    await settle();

    expect(router.url).toBe('/spot/b');
    expect(lastHistoryChange()).toBe('replace: /spot/b');
    expect(store.detail()).toEqual({
      status: 'loading',
      id: 'b',
      preview: BETA,
    });
  });

  it('cancels the load of a spot it has already switched away from', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();
    const first = requests.get('a')!;

    store.open('b', 'pin');
    await settle();

    expect(first.observed).toBeFalse();
  });

  it('closes a spot it opened by going back in history', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();
    const back = spyOn(location, 'back');

    store.close();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('reads going back to /map as closing the detail: the list is live again and the title restored', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();
    store.setBounds(EMPTY_CORNER);

    await harness.navigateByUrl('/map');

    expect(store.detail()).toBeNull();
    expect(store.shownSpots()).toEqual([]);
    expect(title.getTitle()).toBe(PAGE_TITLE);
  });

  it('closes a spot opened from a link by replacing it with /map, never leaving the site', async () => {
    await openPage('/spot/a');
    answer('a', {
      type: 'found',
      spot: spotDetail('a', 'vienna', 'Alpha Bank', [16.37, 48.2]),
      source: 'live',
    });
    const back = spyOn(location, 'back');

    store.close();
    await settle();

    expect(back).not.toHaveBeenCalled();
    expect(router.url).toBe('/map');
    expect(lastHistoryChange()).toBe('replace: /map');
  });

  it('holds the map back on a cold link until the spot names its city, then builds that city on the spot', async () => {
    await openPage('/spot/g');
    expect(store.mapCity()).toBeNull();
    expect(store.detail()).toEqual({
      status: 'loading',
      id: 'g',
      preview: null,
    });

    answer('g', {
      type: 'found',
      spot: spotDetail('g', 'graz', 'Gamma Gap', [15.44, 47.07]),
      source: 'live',
    });

    expect(store.city()).toEqual(SUPPORTED_CITIES[CityEnum.Graz]);
    expect(store.mapCity()).toBe(CityEnum.Graz);
    expect(store.openOn()).toEqual({
      center: [15.44, 47.07],
      zoom: SPOT_FOCUS_ZOOM,
    });
    expect(localStorage.getItem(USER_CITY_STORAGE_KEY)).toBe(CityEnum.Graz);
    expect(title.getTitle()).toBe(`GAMMA GAP${DOCUMENT_TITLE_SUFFIX}`);
  });

  it('centres the remembered city on a cold link that belongs to it', async () => {
    await openPage('/spot/a');
    answer('a', {
      type: 'found',
      spot: spotDetail('a', 'vienna', 'Alpha Bank', [16.37, 48.2]),
      source: 'snapshot',
    });

    expect(store.mapCity()).toBe(CityEnum.Vienna);
    expect(store.openOn()).toEqual({
      center: [16.37, 48.2],
      zoom: SPOT_FOCUS_ZOOM,
    });
  });

  it('opens the remembered city at /map with a notice for an unknown id', async () => {
    await openPage('/spot/nope');
    answer('nope', { type: 'not-found' });
    await settle();

    expect(store.notice()).toBe('not-found');
    expect(router.url).toBe('/map');
    expect(lastHistoryChange()).toBe('replace: /map');
    expect(store.mapCity()).toBe(CityEnum.Vienna);
    expect(store.detail()).toBeNull();
  });

  for (const city of ['atlantis', 'constructor']) {
    it(`treats a spot in a city the app has no map for (${city}) as not found`, async () => {
      await openPage('/spot/x');
      answer('x', {
        type: 'found',
        spot: spotDetail('x', city, 'Nowhere', [0, 0]),
        source: 'live',
      });
      await settle();

      expect(store.notice()).toBe('not-found');
      expect(store.city()).toEqual(SUPPORTED_CITIES[CityEnum.Vienna]);
    });
  }

  it('keeps what the list knew when the detail cannot be loaded', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();

    failLoad('a');

    expect(store.detail()).toEqual({
      status: 'failed',
      id: 'a',
      preview: ALPHA,
    });
    expect(store.mapCity()).toBe(CityEnum.Vienna);
  });

  it('shows the remembered map behind a cold link that cannot be loaded', async () => {
    await openPage('/spot/a');
    failLoad('a');

    expect(store.detail()).toEqual({
      status: 'failed',
      id: 'a',
      preview: null,
    });
    expect(store.mapCity()).toBe(CityEnum.Vienna);
  });

  it('retries a failed detail, keeping the preview while it loads', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();
    failLoad('a');

    store.retryDetail();

    expect(loadSpotDetail).toHaveBeenCalledTimes(2);
    expect(store.detail()).toEqual({
      status: 'loading',
      id: 'a',
      preview: ALPHA,
    });
  });

  it('switches city for a spot of another city reached through the URL', async () => {
    await openViennaMap();

    await harness.navigateByUrl('/spot/g');
    expect(store.detail()).toEqual({
      status: 'loading',
      id: 'g',
      preview: null,
    });
    answer('g', {
      type: 'found',
      spot: spotDetail('g', 'graz', 'Gamma Gap', [15.44, 47.07]),
      source: 'live',
    });

    expect(store.mapCity()).toBe(CityEnum.Graz);
    expect(store.openOn()).toEqual({
      center: [15.44, 47.07],
      zoom: SPOT_FOCUS_ZOOM,
    });
    expect(store.shownSpots()).toBeNull();
  });

  it('closes an open spot and starts the new city fresh when the city changes', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();

    store.selectCity(SUPPORTED_CITIES[CityEnum.Graz]);
    await settle();

    expect(router.url).toBe('/map');
    expect(lastHistoryChange()).toBe('replace: /map');
    expect(store.city()).toEqual(SUPPORTED_CITIES[CityEnum.Graz]);
    expect(store.mapCity()).toBe(CityEnum.Graz);
    expect(store.openOn()).toBeNull();
    expect(store.shownSpots()).toBeNull();
    expect(store.detail()).toBeNull();
    expect(localStorage.getItem(USER_CITY_STORAGE_KEY)).toBe(CityEnum.Graz);
  });

  it('changes nothing when the city picked is the one already shown', async () => {
    await openViennaMap();
    const navigate = spyOn(router, 'navigate').and.callThrough();

    store.selectCity(SUPPORTED_CITIES[CityEnum.Vienna]);

    expect(navigate).not.toHaveBeenCalled();
    expect(store.shownSpots()).toEqual([ALPHA, BETA]);
  });

  it('drops the notice on the next interaction', async () => {
    await openPage('/spot/nope');
    answer('nope', { type: 'not-found' });
    await settle();

    store.dismissNotice();
    expect(store.notice()).toBeNull();
  });

  it('drops the notice when a spot is opened', async () => {
    await openPage('/spot/nope');
    answer('nope', { type: 'not-found' });
    await settle();
    answerList();

    store.open('a', 'list');
    expect(store.notice()).toBeNull();
  });

  it('keeps the hovered spot for the map and the list', async () => {
    await openPage('/map');
    store.setHovered('b');
    expect(store.hoveredId()).toBe('b');
    store.setHovered(null);
    expect(store.hoveredId()).toBeNull();
  });

  describe('a spot the router opens', () => {
    it('freezes the list too, as when the browser goes Forward to an opened spot', async () => {
      await openViennaMap();

      await harness.navigateByUrl('/spot/a');
      store.setBounds(EMPTY_CORNER);

      expect(store.shownSpots()).toEqual([ALPHA, BETA]);
    });

    it('gives the list back live after Back, then freezes it again on Forward', async () => {
      await openViennaMap();
      store.open('a', 'list');
      await settle();
      await harness.navigateByUrl('/map');
      store.setBounds(EMPTY_CORNER);
      expect(store.shownSpots()).toEqual([]);
      store.setBounds(ALL_OF_VIENNA);

      await harness.navigateByUrl('/spot/a');
      store.setBounds(EMPTY_CORNER);

      expect(store.shownSpots()).toEqual([ALPHA, BETA]);
    });

    it('saves nothing for a link opened cold: the list follows the view, and Back shows the current one', async () => {
      await openPage('/spot/a');
      answer('a', {
        type: 'found',
        spot: spotDetail('a', 'vienna', 'Alpha Bank', [16.37, 48.2]),
        source: 'live',
      });
      answerList();
      store.setBounds(ALL_OF_VIENNA);
      expect(store.shownSpots()).toEqual([ALPHA, BETA]);
      store.setBounds(EMPTY_CORNER);
      expect(store.shownSpots()).toEqual([]);

      await harness.navigateByUrl('/map');

      expect(store.shownSpots()).toEqual([]);
    });

    it('names no row to return focus to', async () => {
      await openViennaMap();
      store.open('a', 'list');
      await settle();
      await harness.navigateByUrl('/map');

      await harness.navigateByUrl('/spot/a');

      expect(store.returnFocusTo()).toBeNull();
    });
  });

  describe('the row focus returns to', () => {
    it('stays on the row that opened the spot after it closes', async () => {
      await openViennaMap();
      store.open('a', 'list');
      await settle();

      await harness.navigateByUrl('/map');

      expect(store.returnFocusTo()).toBe('a');
    });

    it('is dropped when a pin switches to another spot', async () => {
      await openViennaMap();
      store.open('a', 'list');
      await settle();

      store.open('b', 'pin');
      await settle();

      expect(store.returnFocusTo()).toBeNull();
    });
  });

  describe('closing', () => {
    it('goes back in history once however often it is asked before the route has changed', async () => {
      await openViennaMap();
      store.open('a', 'list');
      await settle();
      const back = spyOn(location, 'back');

      store.close();
      store.close();

      expect(back).toHaveBeenCalledTimes(1);
    });

    it('can close the next spot once the route has reached /map', async () => {
      await openViennaMap();
      store.open('a', 'list');
      await settle();
      const back = spyOn(location, 'back');
      store.close();
      await harness.navigateByUrl('/map');

      store.open('b', 'list');
      await settle();
      store.close();

      expect(back).toHaveBeenCalledTimes(2);
    });

    it('replaces a cold link with /map once however often it is asked', async () => {
      await openPage('/spot/a');
      const navigate = spyOn(router, 'navigate').and.callThrough();

      store.close();
      store.close();
      await settle();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(router.url).toBe('/map');
    });
  });

  describe('the hovered spot', () => {
    it('is dropped when a spot opens', async () => {
      await openViennaMap();
      store.setHovered('b');

      store.open('a', 'list');
      await settle();

      expect(store.hoveredId()).toBeNull();
    });

    it('is dropped when the spot closes', async () => {
      await openViennaMap();
      store.open('a', 'list');
      await settle();
      store.setHovered('b');

      await harness.navigateByUrl('/map');

      expect(store.hoveredId()).toBeNull();
    });

    it('is dropped when the city changes', async () => {
      await openViennaMap();
      store.setHovered('a');

      store.selectCity(SUPPORTED_CITIES[CityEnum.Graz]);

      expect(store.hoveredId()).toBeNull();
    });

    it('is dropped when its spot leaves the list, and kept while it stays', async () => {
      await openViennaMap();
      store.setHovered('a');

      store.setBounds({ west: 16, south: 48, east: 17, north: 48.5 });
      expect(store.hoveredId()).toBe('a');

      store.setBounds(EMPTY_CORNER);
      expect(store.hoveredId()).toBeNull();
    });
  });

  describe('while the map moves', () => {
    it('keeps the very same list when a pan changes nothing in it', async () => {
      await openViennaMap();
      const before = store.shownSpots();

      store.setBounds({ west: 15.9, south: 47.9, east: 17.1, north: 49.1 });

      expect(store.shownSpots()).toBe(before);
    });

    it('gives a new list when the spots in view change', async () => {
      await openViennaMap();
      const before = store.shownSpots();

      store.setBounds({ west: 16.38, south: 48.1, east: 17, north: 49 });

      expect(store.shownSpots()).toEqual([BETA]);
      expect(store.shownSpots()).not.toBe(before);
    });
  });

  describe('the preview of a spot opened from a pin', () => {
    it('comes from the loaded city when the spot is outside the view and the frozen list', async () => {
      await openViennaMap();
      store.setBounds(EMPTY_CORNER);

      store.open('a', 'pin');
      await settle();

      expect(store.shownSpots()).toEqual([]);
      expect(store.detail()).toEqual({
        status: 'loading',
        id: 'a',
        preview: ALPHA,
      });
    });

    it('is still found for the next spot switched to', async () => {
      await openViennaMap();
      store.setBounds(EMPTY_CORNER);
      store.open('a', 'pin');
      await settle();

      store.open('b', 'pin');
      await settle();

      expect(store.detail()).toEqual({
        status: 'loading',
        id: 'b',
        preview: BETA,
      });
    });

    it('stays what the frozen list showed when the list changes before a retry', async () => {
      await openViennaMap();
      store.open('a', 'pin');
      await settle();
      failLoad('a');
      store.reloadList();
      answerList({
        type: 'FeatureCollection',
        features: [
          BETA,
          listFeature('a', 'Alpha Bank, renamed', [16.37, 48.2]),
        ],
      });

      store.retryDetail();

      expect(store.detail()).toEqual({
        status: 'loading',
        id: 'a',
        preview: ALPHA,
      });
    });

    it('is empty before the city has loaded', async () => {
      await openPage('/map');

      store.open('a', 'pin');
      await settle();

      expect(store.detail()).toEqual({
        status: 'loading',
        id: 'a',
        preview: null,
      });
    });
  });

  it('puts the title back when the page goes while a spot is open', async () => {
    await openViennaMap();
    store.open('a', 'list');
    await settle();

    await harness.navigateByUrl('/home');

    expect(title.getTitle()).toBe(PAGE_TITLE);
  });

  describe('the city list load', () => {
    const kinds = () => store.listEvents().map((event) => event.kind);
    const shownIds = () =>
      store.shownSpots()?.map((spot) => spot.properties.id) ?? null;

    it('asks for the remembered city as the page opens, in the store rather than the map', async () => {
      await openPage('/map');
      expect(loadSpotList).toHaveBeenCalledOnceWith(store.city().city);
    });

    it('logs every milestone in order, including a fallback and the snapshot request behind it', async () => {
      await openPage('/map');
      const { request } = listRequests[0];
      request.next({ type: 'sent' });
      request.next({ type: 'fallback' });
      request.next({ type: 'sent' });
      request.next({ type: 'headers' });
      request.next({
        type: 'done',
        collection: VIENNA_LIST,
        source: 'snapshot',
      });
      expect(kinds()).toEqual([
        'spots-sent',
        'spots-fallback',
        'spots-sent',
        'spots-headers',
        'spots-done',
      ]);
    });

    it('hands the map the list once it arrives, and not before', async () => {
      await openPage('/map');
      expect(store.mapSpots()).toBeNull();
      answerList();
      expect(store.mapSpots()).toBe(VIENNA_LIST);
      expect(store.listFailed()).toBeFalse();
    });

    it('fails the load on a request error and applies nothing', async () => {
      await openPage('/map');
      store.setBounds(ALL_OF_VIENNA);
      listRequests[0].request.error(new Error('no source answered'));
      expect(store.listFailed()).toBeTrue();
      expect(store.mapSpots()).toBeNull();
      expect(store.shownSpots()).toBeNull();
    });

    it('fails the load on an empty answer and applies nothing', async () => {
      await openPage('/map');
      store.setBounds(ALL_OF_VIENNA);
      answerList({ type: 'FeatureCollection', features: [] });
      expect(store.listFailed()).toBeTrue();
      expect(store.mapSpots()).toBeNull();
      expect(store.shownSpots()).toBeNull();
    });

    it('fails the load when the stream completes with no answer', async () => {
      await openPage('/map');
      listRequests[0].request.complete();
      expect(store.listFailed()).toBeTrue();
      expect(store.mapSpots()).toBeNull();
    });

    it('cancels the request in flight on a city switch, which never shows the old city’s spots', async () => {
      await openPage('/map');
      const first = listRequests[0];
      first.request.next({ type: 'sent' });
      store.selectCity(SUPPORTED_CITIES[CityEnum.Graz]);
      expect(first.request.observed).toBeFalse();
      expect(listRequests.at(-1)!.city).toBe(CityEnum.Graz);
      expect(store.mapSpots()).toBeNull();
      expect(store.listEvents()).toEqual([]);
    });

    it('starts the new city’s load in the same tick as the map’s city, after a loaded list', async () => {
      await openViennaMap();
      store.selectCity(SUPPORTED_CITIES[CityEnum.Graz]);
      expect(store.mapCity()).toBe(CityEnum.Graz);
      expect(store.mapSpots()).toBeNull();
      expect(listRequests.at(-1)!.city).toBe(CityEnum.Graz);
      expect(store.shownSpots()).toBeNull();
    });

    it('cancels the request in flight when the page goes', async () => {
      await openPage('/map');
      const first = listRequests[0];
      await harness.navigateByUrl('/home');
      expect(first.request.observed).toBeFalse();
    });

    it('asks no list while a cold link holds the map, then asks for the spot’s city', async () => {
      await openPage('/spot/a');
      expect(loadSpotList).not.toHaveBeenCalled();
      answer('a', {
        type: 'found',
        spot: spotDetail('a', CityEnum.Graz, 'Alpha Bank', [15.44, 47.07]),
        source: 'live',
      });
      expect(loadSpotList).toHaveBeenCalledOnceWith(CityEnum.Graz);
    });

    it('asks for the remembered city when a held cold link’s spot is gone', async () => {
      await openPage('/spot/nope');
      answer('nope', { type: 'not-found' });
      expect(loadSpotList).toHaveBeenCalledOnceWith(store.city().city);
    });

    it('asks for the remembered city when a held cold link’s detail fails', async () => {
      await openPage('/spot/a');
      failLoad('a');
      expect(loadSpotList).toHaveBeenCalledOnceWith(store.city().city);
    });

    it('keeps the rows on a reload, resets the load and bumps the attempt', async () => {
      await openViennaMap();
      const before = shownIds();
      store.reloadList();
      expect(shownIds()).toEqual(before);
      expect(store.mapSpots()).toBeNull();
      expect(store.listEvents()).toEqual([]);
      expect(store.listAttempt()).toBe(1);
      expect(listRequests.length).toBe(2);
      expect(listRequests[1].city).toBe(listRequests[0].city);
    });

    it('clears a failed load on a reload and keeps the rows through a failed one', async () => {
      await openViennaMap();
      const before = shownIds();
      store.reloadList();
      listRequests[1].request.error(new Error('no source answered'));
      expect(store.listFailed()).toBeTrue();
      expect(shownIds()).toEqual(before);
      store.reloadList();
      expect(store.listFailed()).toBeFalse();
    });

    it('lists everything when the map gives up before the list arrives', async () => {
      await openPage('/map');
      store.mapGaveUp();
      expect(store.shownSpots()).toBeNull();
      answerList();
      expect(shownIds()).toEqual(['a', 'b']);
    });

    it('lists everything at once when the map gives up after the list arrived', async () => {
      await openPage('/map');
      answerList();
      expect(store.shownSpots()).toBeNull();
      store.mapGaveUp();
      expect(shownIds()).toEqual(['a', 'b']);
    });

    it('follows the real view when a map paints after giving up', async () => {
      await openPage('/map');
      answerList();
      store.mapGaveUp();
      store.setBounds(EMPTY_CORNER);
      expect(shownIds()).toEqual([]);
    });
  });
});
