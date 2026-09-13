import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CityEnum } from '../../../models/enums/map-enum';
import { MAP_FACTORY } from './map-factory.token';
import { POPUP_FACTORY, SpotMapComponent } from './spot-map.component';

/** Records everything the component asks of a map, without being one. */
class FakeMap {
  readonly handlers = new Map<string, ((e?: unknown) => void)[]>();
  readonly sources: Record<string, unknown> = {};
  readonly layers: { id: string }[] = [];
  readonly featureStates: Record<string, Record<string, unknown>> = {};
  readonly canvas = document.createElement('canvas');
  readonly dragRotate = { disable: jasmine.createSpy('dragRotate.disable') };
  readonly touchZoomRotate = {
    disableRotation: jasmine.createSpy('disableRotation'),
  };
  /**
   * Drives `isStyleLoaded()`, and is flipped to `true` by `failBasemapSource()` on purpose:
   * MapLibre reports the style loaded the instant a source errors. `VectorTileSource.load()`'s
   * catch sets `_loaded` before firing the error (maplibre-gl-dev.mjs:2877-2881), the tile
   * manager's own `error` listener flips `_sourceErrored` (`:6359-6360`), and that
   * short-circuits `TileManager.loaded()` (`:6391`), `Style.loaded()` (`:14890-14894`) and
   * `Map.isStyleLoaded()` (`:25824`) to true. Modelling that here keeps a discriminator from
   * looking right against the fake while misreading every real failure.
   */
  styleLoaded = false;
  removed = false;
  lastFitBounds?: { padding: number; duration: number; maxZoom: number };
  /** The style the component handed the factory — where the basemap's source id comes from. */
  style?: { sources: Record<string, unknown> };

  on(event: string, layerOrFn: unknown, maybeFn?: unknown) {
    const layer = typeof layerOrFn === 'string' ? layerOrFn : undefined;
    const fn = (
      typeof layerOrFn === 'function' ? layerOrFn : maybeFn
    ) as () => void;
    const key = this.key(event, layer);
    this.handlers.set(key, [...(this.handlers.get(key) ?? []), fn]);
    return this;
  }
  emit(event: string, payload?: unknown, layer?: string) {
    for (const fn of this.handlers.get(this.key(event, layer)) ?? []) {
      fn(payload);
    }
  }
  private key(event: string, layer?: string) {
    return layer ? `${event}:${layer}` : event;
  }
  addSource(id: string, source: unknown) {
    this.sources[id] = source;
  }
  addLayer(layer: { id: string }) {
    this.layers.push(layer);
  }
  fitBounds(
    _bounds: unknown,
    options: { padding: number; duration: number; maxZoom: number },
  ) {
    this.lastFitBounds = options;
  }
  addControl() {
    return this;
  }
  getCanvas() {
    return this.canvas;
  }
  isStyleLoaded() {
    return this.styleLoaded;
  }
  setFeatureState(target: { id: string }, state: Record<string, unknown>) {
    this.featureStates[target.id] = {
      ...this.featureStates[target.id],
      ...state,
    };
  }
  removeFeatureState(target: { id: string }, key?: string) {
    const state = this.featureStates[target.id];
    if (!state) {
      return;
    }
    if (key) {
      delete state[key];
    } else {
      delete this.featureStates[target.id];
    }
  }
  remove() {
    this.removed = true;
  }

  /** The source the component's own style declares; MapLibre tags its events with that id. */
  private get basemapSourceId(): string {
    const [id] = Object.keys(this.style?.sources ?? {});
    if (!id) {
      throw new Error('the map factory was handed no style with a source');
    }
    return id;
  }

  /**
   * The basemap's TileJSON arriving: the source fires `data`/`metadata`
   * (maplibre-gl-dev.mjs:2871), the tile manager bubbles it carrying its `sourceId`
   * (`:15165-15169`), and the map re-fires it as `sourcedata` (`:24181`).
   */
  loadBasemapMetadata() {
    this.emit('sourcedata', {
      sourceId: this.basemapSourceId,
      sourceDataType: 'metadata',
      isSourceLoaded: true,
    });
  }

  /**
   * The basemap never coming up. The TileJSON request failed, so the catch fires an error naming
   * the source and nothing else, and the `metadata` event never happens at all — 2877-2881 is
   * the failure branch of the `:2868-2875` success branch that fires it.
   */
  failBasemapSource() {
    this.styleLoaded = true;
    this.emit('error', {
      error: new Error('Failed to fetch https://tiles.openfreemap.org/planet'),
      sourceId: this.basemapSourceId,
    });
  }

  /**
   * One resource of a live basemap failing: a vector tile, or a glyph range fetched while that
   * tile is parsed (maplibre-gl-worker-dev.mjs:164-226). MapLibre fires it on the source with
   * the tile attached (maplibre-gl-dev.mjs:6422); other tiles are still in flight, so the style
   * is not loaded at that point.
   */
  failOneResource() {
    this.emit('error', {
      error: new Error('one tile failed to load'),
      sourceId: this.basemapSourceId,
      tile: { tileID: { key: '14/8936/5681' } },
    });
  }

  /**
   * A style-level error the map paints through: `Source layer … does not exist` is fired on the
   * style itself (maplibre-gl-dev.mjs:14888), so it names no source at all.
   */
  failStyleValidation() {
    this.emit('error', {
      error: new Error(
        'Source layer "water" does not exist on source "openmaptiles"',
      ),
    });
  }
}

/** Records everything the component asks of a popup, without being one. */
class FakePopup {
  lngLat?: [number, number];
  content?: HTMLElement;
  addedTo?: unknown;
  removed = false;
  private readonly closeHandlers: (() => void)[] = [];

  constructor(
    readonly options: {
      closeButton: boolean;
      maxWidth: string;
      className: string;
    },
  ) {}

  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  setDOMContent(node: HTMLElement) {
    this.content = node;
    return this;
  }
  addTo(map: unknown) {
    this.addedTo = map;
    return this;
  }
  on(event: string, fn: () => void) {
    if (event === 'close') {
      this.closeHandlers.push(fn);
    }
    return this;
  }
  /** MapLibre fires `close` from `remove()`, so the fake does too. */
  remove() {
    this.removed = true;
    for (const fn of this.closeHandlers) {
      fn();
    }
    return this;
  }
}

const COLLECTION = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.37, 48.2] },
      properties: {
        id: 'a',
        name: 'Alpha Bank',
        status: 'active',
        photos: ['spots/vienna/a-1.webp'],
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.4, 48.22] },
      properties: {
        id: 'b',
        name: 'Beta Ledge',
        status: 'demolished',
        photos: ['spots/vienna/b-1.webp'],
      },
    },
  ],
};

/** The shape MapLibre hands a layer click handler, trimmed to what the component reads. */
function tapOn(id: string) {
  return { features: [{ id, properties: { id } }] };
}

describe('SpotMapComponent', () => {
  let fixture: ComponentFixture<SpotMapComponent>;
  let fake: FakeMap;
  let popups: FakePopup[];
  let httpMock: HttpTestingController;
  let getContext: jasmine.Spy;
  let loseContext: jasmine.Spy;
  let mapFactory: jasmine.Spy;
  let popupFactoryRejects: boolean;

  beforeEach(async () => {
    fake = new FakeMap();
    popups = [];
    popupFactoryRejects = false;
    // Headless Chrome hands out no WebGL context, so the component's support probe is faked
    // here; the unsupported spec below drives the same spy to null.
    loseContext = jasmine.createSpy('loseContext');
    getContext = spyOn(HTMLCanvasElement.prototype, 'getContext');
    getContext.and.returnValue({
      getExtension: () => ({ loseContext }),
    } as unknown as WebGL2RenderingContext);
    mapFactory = jasmine
      .createSpy('mapFactory')
      .and.callFake(
        (options: { style: { sources: Record<string, unknown> } }) => {
          fake.style = options.style;
          return Promise.resolve(fake);
        },
      );
    await TestBed.configureTestingModule({
      imports: [SpotMapComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAP_FACTORY, useValue: mapFactory },
        {
          provide: POPUP_FACTORY,
          useValue: (options: FakePopup['options']) => {
            if (popupFactoryRejects) {
              // The realistic failure: the lazy maplibre-gl chunk never arrives.
              return Promise.reject(new Error('popup chunk failed to load'));
            }
            const popup = new FakePopup(options);
            popups.push(popup);
            return Promise.resolve(popup);
          },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  async function create() {
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    fixture.detectChanges();
    httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** Re-arms the renderer the way the container's RETRY does, on a fresh map. */
  async function retry(token: number) {
    fake = new FakeMap();
    fixture.componentRef.setInput('retryToken', token);
    fixture.detectChanges();
    httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
    await fixture.whenStable();
  }

  async function tap(id: string) {
    fake.emit('click', tapOn(id), 'spots-hit');
    await fixture.whenStable();
  }

  it('disables rotation so a two-finger gesture can only pan and zoom', async () => {
    await create();
    expect(fake.dragRotate.disable).toHaveBeenCalled();
    expect(fake.touchZoomRotate.disableRotation).toHaveBeenCalled();
  });

  it('adds the spot source and its pin layers', async () => {
    await create();
    fake.emit('load');
    expect(fake.sources['spots']).toBeDefined();
    const ids = fake.layers.map((l) => l.id);
    expect(ids).toContain('spots-hit');
    expect(ids).toContain('spots-glow');
    expect(ids).toContain('spots-body');
    expect(ids).toContain('spots-selected');
  });

  it('draws the thumb target under the visible pin, not over it', async () => {
    await create();
    fake.emit('load');
    const ids = fake.layers.map((l) => l.id);
    expect(ids.indexOf('spots-hit')).toBeLessThan(ids.indexOf('spots-body'));
  });

  it('fits the viewport to the loaded spots instead of a hardcoded centre', async () => {
    await create();
    fake.emit('load');
    expect(fake.lastFitBounds).toBeDefined();
    expect(fake.lastFitBounds!.maxZoom).toBeLessThanOrEqual(16);
  });

  it('emits ready once the map reports load', async () => {
    const c = await create();
    const ready = jasmine.createSpy('ready');
    c.ready.subscribe(ready);
    fake.emit('load');
    expect(ready).toHaveBeenCalled();
  });

  it('treats a basemap whose source never came up as fatal', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    c.failed.subscribe(failed);
    fake.failBasemapSource();
    expect(failed).toHaveBeenCalledWith('unreachable');
  });

  it('ignores an error after a successful load', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    c.failed.subscribe(failed);
    fake.emit('load');
    fake.failOneResource();
    expect(failed).not.toHaveBeenCalled();
  });

  it('survives a single failed resource before first paint', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    const ready = jasmine.createSpy('ready');
    c.failed.subscribe(failed);
    c.ready.subscribe(ready);
    // The basemap reported in, so the failure is one tile or one glyph range of a live map.
    fake.loadBasemapMetadata();
    fake.failOneResource();
    fake.emit('load');
    expect(failed).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalled();
    expect(fake.removed).toBe(false);
  });

  it('survives a single failed resource even before the basemap reports in', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    const ready = jasmine.createSpy('ready');
    c.failed.subscribe(failed);
    c.ready.subscribe(ready);
    // The handlers are attached after the factory resolves, so the metadata event can be missed
    // entirely; an error that names the tile it was loading is still one tile, not the basemap.
    fake.failOneResource();
    fake.emit('load');
    expect(failed).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalled();
    expect(fake.removed).toBe(false);
  });

  it('keeps a style error it can paint through from killing the map', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    const ready = jasmine.createSpy('ready');
    c.failed.subscribe(failed);
    c.ready.subscribe(ready);
    fake.failStyleValidation();
    fake.emit('load');
    expect(failed).not.toHaveBeenCalled();
    expect(fake.removed).toBe(false);
    expect(ready).toHaveBeenCalled();
  });

  it('never reports ready for a map it has already given up on', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    const ready = jasmine.createSpy('ready');
    c.failed.subscribe(failed);
    c.ready.subscribe(ready);
    fake.failBasemapSource();
    // MapLibre fires `load` even for a map whose source died, because `Map.loaded()` reads the
    // same short-circuited `Style.loaded()` (maplibre-gl-dev.mjs:27046-27047, :27140-27142).
    fake.emit('load');
    expect(failed).toHaveBeenCalledWith('unreachable');
    expect(ready).not.toHaveBeenCalled();
  });

  it('releases the WebGL context of a map it has given up on', async () => {
    await create();
    fake.failBasemapSource();
    expect(fake.removed).toBe(true);
  });

  it('ignores an error from a map it has already torn down', async () => {
    const c = await create();
    const abandoned = fake;
    await retry(1);
    const failed = jasmine.createSpy('failed');
    c.failed.subscribe(failed);
    abandoned.failBasemapSource();
    expect(failed).not.toHaveBeenCalled();
  });

  it('releases the WebGL context it probes the browser with', async () => {
    await create();
    expect(loseContext).toHaveBeenCalledTimes(1);
    await retry(1);
    expect(loseContext).toHaveBeenCalledTimes(2);
  });

  it('fails as unsupported when the browser has no WebGL', async () => {
    getContext.and.returnValue(null);
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    const failed = jasmine.createSpy('failed');
    fixture.componentInstance.failed.subscribe(failed);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(failed).toHaveBeenCalledWith('unsupported');
    httpMock.expectNone('spots/vienna.geojson');
  });

  it('reports a spot fetch failure as unreachable', async () => {
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    const failed = jasmine.createSpy('failed');
    fixture.componentInstance.failed.subscribe(failed);
    fixture.detectChanges();
    httpMock
      .expectOne('spots/vienna.geojson')
      .flush('nope', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(failed).toHaveBeenCalledWith('unreachable');
  });

  it('reports a city with no spots rather than opening on the null island', async () => {
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    const failed = jasmine.createSpy('failed');
    fixture.componentInstance.failed.subscribe(failed);
    fixture.detectChanges();
    httpMock
      .expectOne('spots/vienna.geojson')
      .flush({ type: 'FeatureCollection', features: [] });
    await fixture.whenStable();
    expect(failed).toHaveBeenCalledWith('unreachable');
    expect(mapFactory).not.toHaveBeenCalled();
  });

  it('rebuilds the map when the retry token changes', async () => {
    await create();
    const first = fake;
    await retry(1);
    expect(first.removed).toBe(true);
    expect(fake.dragRotate.disable).toHaveBeenCalled();
  });

  it('removes the map on destroy so the WebGL context is released', async () => {
    await create();
    fixture.destroy();
    expect(fake.removed).toBe(true);
  });

  it('opens one popup for the tapped pin and marks that pin selected', async () => {
    await create();
    fake.emit('load');
    await tap('a');
    expect(popups.length).toBe(1);
    expect(popups[0]?.options.closeButton).toBe(true);
    expect(popups[0]?.options.maxWidth).toBe('320px');
    expect(popups[0]?.options.className).toBe('spot-popup-frame');
    expect(popups[0]?.lngLat).toEqual([16.37, 48.2]);
    expect(popups[0]?.addedTo === fake)
      .withContext('the popup was added to the live map')
      .toBe(true);
    expect(popups[0]?.content?.textContent).toContain('Alpha Bank');
    expect(fake.featureStates['a']?.['selected']).toBe(true);
  });

  it('moves the selection on a second tap instead of stacking popups', async () => {
    await create();
    fake.emit('load');
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    await tap('a');
    expect(appRef.viewCount).toBe(baseline + 1);
    await tap('b');
    expect(popups.length).toBe(2);
    expect(popups[0]?.removed).toBe(true);
    expect(popups[1]?.removed).toBe(false);
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
    expect(fake.featureStates['b']?.['selected']).toBe(true);
    expect(appRef.viewCount).toBe(baseline + 1);
  });

  it('drops the selection when the popup is closed', async () => {
    await create();
    fake.emit('load');
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    await tap('a');
    expect(fake.featureStates['a']?.['selected']).toBe(true);
    expect(appRef.viewCount).toBe(baseline + 1);
    popups[0]?.remove();
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
    expect(appRef.viewCount).toBe(baseline);
  });

  it('destroys the popup and its view on destroy', async () => {
    await create();
    fake.emit('load');
    await tap('a');
    fixture.destroy();
    expect(popups[0]?.removed).toBe(true);
    expect(TestBed.inject(ApplicationRef).viewCount).toBe(0);
  });

  it('puts the pin back when the popup cannot be built', async () => {
    await create();
    fake.emit('load');
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    popupFactoryRejects = true;
    await tap('a');
    expect(appRef.viewCount)
      .withContext('the popup view was released')
      .toBe(baseline);
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
  });

  it('ignores a tap that carries no spot of its own', async () => {
    await create();
    fake.emit('load');
    fake.emit('click', { features: [] }, 'spots-hit');
    await fixture.whenStable();
    expect(popups.length).toBe(0);
  });

  it('marks the pins as pointer targets while the cursor is over one', async () => {
    await create();
    fake.emit('load');
    fake.emit('mouseenter', undefined, 'spots-hit');
    expect(fake.canvas.style.cursor).toBe('pointer');
    fake.emit('mouseleave', undefined, 'spots-hit');
    expect(fake.canvas.style.cursor).toBe('');
  });
});
