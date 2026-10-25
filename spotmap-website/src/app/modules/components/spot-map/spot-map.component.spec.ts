import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CityEnum } from '../../../models/enums/map-enum';
import {
  type AttributionCorner,
  type MapFocus,
  type MapInsets,
  NO_INSETS,
} from '../../../models/map/map-camera';
import type { MapLoadEvent } from '../../../models/map/map-load-event';
import { SpotListCollection } from '../../../models/spots/spot';
import type { ViewBounds } from '../../../models/spots/spots-in-view';
import { FLAG_REACH_PX } from './photo-pins';
import { SELECTED_PIN_REACH_PX } from './selection-camera';
import { SpotBrowserStore } from '../../pages/map/spot-browser.store';
import type { ElevationTiles } from './elevation';
import { ELEVATION_LOADER, MAP_FACTORY } from './map-factory.token';
import {
  SPOTMAP_BACKEND,
  type SpotmapBackend,
  UNCONFIGURED_BACKEND,
} from '../../../services/spotmap-backend';
import {
  FLAG_AT_REST_FILTER,
  flagFilter,
  HAS_COVER,
  LOCK_ON_AT_REST_FILTER,
  photoPinFilter,
} from './spot-layers';
import { SpotMapComponent } from './spot-map.component';
import { BASEMAP_SOURCE_ID } from './terminal-map-style';
import {
  addAttributionControl,
  buildAttributionControl,
  COLLECTION,
  FakeMap,
  holdAnimationFrames,
  LOCK_ON_AT_REST,
  onlySpot,
  requestHoverPointer,
  requestReducedMotion,
  setWidth,
  tapOn,
} from './testing/fake-map';

// MapLibre internals named in this file were read in maplibre-gl 6.15.0.

/** Stand-in tile URLs in the shape maplibre-contour hands out. */
const ELEVATION_TILES: ElevationTiles = {
  demTiles: 'dem-shared://{z}/{x}/{y}',
  contourTiles: 'dem-contour://{z}/{x}/{y}?thresholds=11*50*100',
  demMaxzoom: 14,
};

/** The terrain layers, each with the basemap layer it belongs under. */
const ELEVATION_LAYERS = [
  { id: 'hillshade', beforeId: 'landcover' },
  { id: 'contour-minor', beforeId: 'plaza' },
  { id: 'contour-major', beforeId: 'plaza' },
  { id: 'contour-label', beforeId: 'water-label' },
];

/** What the browser resolves a design token to for a property, so assertions compare painted output. */
function painted(property: 'border-radius', token: string): string {
  const probe = document.createElement('span');
  probe.style.setProperty(property, token);
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return value;
}

/**
 * The corner rules of maplibre-gl.css 6.15.0 that the attribution control's radius depends on,
 * copied verbatim from its `@media screen` block: the Karma build does not load that stylesheet.
 * The open-state rule is `(0,3,0)` and only matches a control directly inside a left corner.
 */
const MAPLIBRE_ATTRIBUTION_RULES = `@media screen {
  .maplibregl-ctrl-attrib.maplibregl-compact{border-radius:12px}
  .maplibregl-ctrl-bottom-left>.maplibregl-ctrl-attrib.maplibregl-compact-show,.maplibregl-ctrl-top-left>.maplibregl-ctrl-attrib.maplibregl-compact-show{padding:2px 8px 2px 28px;border-radius:12px}
  .maplibregl-ctrl-attrib-button{border-radius:12px}
}`;

/** Loads {@link MAPLIBRE_ATTRIBUTION_RULES} into the page; the caller removes the element. */
function loadMapLibreAttributionRules(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = MAPLIBRE_ATTRIBUTION_RULES;
  document.head.append(style);
  return style;
}

describe('SpotMapComponent', () => {
  let fixture: ComponentFixture<SpotMapComponent>;
  let fake: FakeMap;
  let httpMock: HttpTestingController;
  let getContext: jasmine.Spy;
  let loseContext: jasmine.Spy;
  let mapFactory: jasmine.Spy;
  let elevation: ElevationTiles | null;
  /** What the fake `ELEVATION_LOADER` hands back; resolves `elevation` unless a spec holds it. */
  let loadElevation: (demMaxzoom: number) => Promise<ElevationTiles | null>;
  /** The backend `SPOTMAP_BACKEND` answers with; set before `create()`, which first reads it. */
  let backend: SpotmapBackend;

  beforeEach(async () => {
    elevation = null;
    backend = UNCONFIGURED_BACKEND;
    loadElevation = () => Promise.resolve(elevation);
    fake = new FakeMap();
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
        { provide: SPOTMAP_BACKEND, useFactory: () => backend },
        {
          provide: ELEVATION_LOADER,
          useValue: (demMaxzoom: number) => loadElevation(demMaxzoom),
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  async function create({
    city = CityEnum.Vienna,
    collection = COLLECTION,
    selectedId = null,
    insets = NO_INSETS,
    openOn = null as MapFocus | null,
    attributionCorner = 'bottom-right' as AttributionCorner,
  }: {
    city?: CityEnum;
    collection?: object;
    selectedId?: string | null;
    insets?: MapInsets;
    openOn?: MapFocus | null;
    attributionCorner?: AttributionCorner;
  } = {}) {
    fixture = TestBed.createComponent(SpotMapComponent);
    // A laid-out host, so the canvas host has a real size.
    fixture.nativeElement.style.cssText =
      'display:block;width:1000px;height:600px;position:relative';
    fixture.componentRef.setInput('city', city);
    fixture.componentRef.setInput('retryToken', 0);
    fixture.componentRef.setInput('selectedId', selectedId);
    fixture.componentRef.setInput('coveredInsets', insets);
    fixture.componentRef.setInput('openOn', openOn);
    fixture.componentRef.setInput('attributionCorner', attributionCorner);
    fixture.detectChanges();
    httpMock.expectOne(`spots/${city}.geojson`).flush(collection);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** Puts `id` in the URL's place, the way the page binds `selectedId`. */
  function select(id: string | null) {
    fixture.componentRef.setInput('selectedId', id);
    fixture.detectChanges();
  }

  /** Re-arms the renderer the way the container's RETRY does, on a fresh map. */
  async function retry(token: number) {
    fake = new FakeMap();
    fixture.componentRef.setInput('retryToken', token);
    fixture.detectChanges();
    httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
    await fixture.whenStable();
  }

  /**
   * Holds the terrain loader pending until the spec resolves it by hand, so the map can load — or
   * be replaced, or destroyed — while the relief is still on its way.
   */
  function holdElevation() {
    let resolve!: (tiles: ElevationTiles | null) => void;
    const pending = new Promise<ElevationTiles | null>((settle) => {
      resolve = settle;
    });
    loadElevation = () => pending;
    return resolve;
  }

  /** Holds every animation frame the component asks for until the spec runs them. */
  function captureFrames(): () => void {
    const pending: FrameRequestCallback[] = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      pending.push(callback);
      return pending.length;
    });
    spyOn(window, 'cancelAnimationFrame');
    return () => {
      for (const callback of pending.splice(0)) {
        callback(performance.now());
      }
    };
  }

  /** Puts `id`'s pin under the pointer (`null`: empty map) as the map's feature query finds it. */
  function pointerOver(id: string | null) {
    fake.renderedPins = id === null ? [] : tapOn(id).features;
  }

  /** A tap on the pin of spot `id`, which the map reports as a plain map click with the pin under it. */
  async function tap(id: string) {
    pointerOver(id);
    fake.emit('click', { point: { x: 1, y: 1 } });
    await fixture.whenStable();
  }

  /** The layers the last feature query under the pointer asked about. */
  function queriedLayers(query: jasmine.Spy): string[] {
    return query.calls.mostRecent().args[1].layers;
  }

  it('disables rotation so a two-finger gesture can only pan and zoom', async () => {
    await create();
    expect(fake.dragRotate.disable).toHaveBeenCalled();
    expect(fake.touchZoomRotate.disableRotation).toHaveBeenCalled();
  });

  it('stays flat and north-up through every gesture that could tilt or turn it', async () => {
    await create();
    // A 100 px two-finger drag upwards is ~50° of tilt on a map that still listens for it, and
    // nothing in this app can undo a tilt: there is no compass, no reset, no `setPitch` call.
    fake.twoFingerVerticalDrag(-100);
    fake.shiftArrowUp();
    fake.rightButtonDrag({ x: 80, y: -100 });
    fake.twoFingerTwist(45);
    expect(fake.pitch).toBe(0);
    expect(fake.bearing).toBe(0);
  });

  it('adds the spot source, its pin layers, and the dot footprints last', async () => {
    await create();
    fake.emit('load');
    expect(fake.sources['spots']).toBeDefined();
    expect(fake.layers.map((l) => l.id)).toEqual([
      'spots-hit',
      'spots-glow',
      'spots-selected-gap',
      'spots-selected',
      'spots-lock-on',
      'spots-body',
      'spots-hover',
      'spots-demolished-mark',
      'spots-footprint',
    ]);
  });

  /**
   * Records the order the map is handed images and layers in, as `image:<id>` and `layer:<id>`,
   * while still adding them to the fake.
   */
  function recordAdditions(): string[] {
    const added: string[] = [];
    const addImage = fake.addImage.bind(fake);
    const addLayer = fake.addLayer.bind(fake);
    spyOn(fake, 'addImage').and.callFake((id, image, options) => {
      added.push(`image:${id}`);
      return addImage(id, image, options);
    });
    spyOn(fake, 'addLayer').and.callFake((layer, beforeId) => {
      added.push(`layer:${layer.id}`);
      addLayer(layer, beforeId);
    });
    return added;
  }

  for (const photoHost of [false, true]) {
    it(`adds the footprints’ transparent image, then their layer, on top of every other layer${photoHost ? ' with a photo host' : ''}`, async () => {
      if (photoHost) {
        backend = {
          ...UNCONFIGURED_BACKEND,
          photoBaseUrl: 'https://photos.test',
        };
      }
      await create();
      const added = recordAdditions();
      fake.emit('load');
      expect(added.slice(-2)).toEqual([
        'image:spot-footprint',
        'layer:spots-footprint',
      ]);
      expect(fake.layers.at(-1)?.id).toBe('spots-footprint');
      const image = fake.images.get('spot-footprint')!;
      expect([image.width, image.height]).toEqual([20, 20]);
      expect(
        Array.from(image.data).every((channel) => channel === 0),
      ).toBeTrue();
      expect(fake.imageOptions.get('spot-footprint')).toEqual({
        pixelRatio: 1,
      });
    });
  }

  it('draws the thumb target under the visible pin, not over it', async () => {
    await create();
    fake.emit('load');
    const ids = fake.layers.map((l) => l.id);
    expect(ids.indexOf('spots-hit')).toBeLessThan(ids.indexOf('spots-body'));
  });

  it('frames the city’s own spots and leaves a stray one to be panned to', async () => {
    const spot = (id: string, lng: number, lat: number) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { id, name: id, status: 'active', photos: [] },
    });
    await create({
      collection: {
        type: 'FeatureCollection',
        features: [
          spot('a', 16.37, 48.2),
          spot('b', 16.4, 48.22),
          spot('c', 16.35, 48.19),
          // Melk, ~75 km west of Vienna: the sort of stray the framing must not stretch for.
          spot('stray', 15.33, 48.23),
        ],
      },
    });
    expect(mapFactory.calls.mostRecent().args[0].bounds).toEqual([
      [16.35, 48.19],
      [16.4, 48.22],
    ]);
    fake.emit('load');
    expect(fake.sources['spots']).toEqual(
      jasmine.objectContaining({
        data: jasmine.objectContaining({
          features: jasmine.arrayContaining([
            jasmine.objectContaining({
              properties: jasmine.objectContaining({ id: 'stray' }),
            }),
          ]),
        }),
      }),
    );
  });

  it('collapses the attribution to its info button on a narrow map', async () => {
    await create();
    const attribution = addAttributionControl(
      fixture.nativeElement.querySelector('.spot-map__canvas'),
      360,
    );
    fake.emit('load');
    expect(attribution.classList).not.toContain('maplibregl-compact-show');
    expect(attribution.classList).toContain('maplibregl-compact');
  });

  it('collapses the attribution on a map exactly at the narrow-map width', async () => {
    await create();
    const attribution = addAttributionControl(
      fixture.nativeElement.querySelector('.spot-map__canvas'),
      640,
    );
    fake.emit('load');
    expect(attribution.classList).not.toContain('maplibregl-compact-show');
  });

  it('leaves the attribution open on a map a pixel wider than the narrow-map width', async () => {
    await create();
    const attribution = addAttributionControl(
      fixture.nativeElement.querySelector('.spot-map__canvas'),
      641,
    );
    fake.emit('load');
    expect(attribution.classList).toContain('maplibregl-compact-show');
  });

  it('collapses the attribution when a map that opened wide is narrowed', async () => {
    await create();
    const host = fixture.nativeElement.querySelector('.spot-map__canvas');
    const attribution = addAttributionControl(host, 844);
    fake.emit('load');
    expect(attribution.classList).toContain('maplibregl-compact-show');
    setWidth(host, 390);
    fake.emit('resize');
    expect(attribution.classList).not.toContain('maplibregl-compact-show');
  });

  it('does not close the attribution again on a resize while the map stays narrow', async () => {
    await create();
    const host = fixture.nativeElement.querySelector('.spot-map__canvas');
    const attribution = addAttributionControl(host, 390);
    fake.emit('load');
    // The visitor taps the info button open; a later resize (the address bar sliding away) is
    // not a reason to shut it on them.
    attribution.classList.add('maplibregl-compact-show');
    setWidth(host, 392);
    fake.emit('resize');
    expect(attribution.classList).toContain('maplibregl-compact-show');
  });

  it('leaves the attribution open on a map wide enough to spare the room', async () => {
    await create();
    const attribution = addAttributionControl(
      fixture.nativeElement.querySelector('.spot-map__canvas'),
      1200,
    );
    fake.emit('load');
    expect(attribution.classList).toContain('maplibregl-compact-show');
  });

  for (const corner of ['bottom-right', 'bottom-left'] as const) {
    it(`keeps the attribution control in the ${corner} corner on the soft corner scale, collapsed or open`, async () => {
      const mapLibreRules = loadMapLibreAttributionRules();
      const bare = buildAttributionControl(corner);
      document.body.append(bare);
      try {
        await create();
        const softCorner = painted('border-radius', 'var(--radius-sm)');
        expect(softCorner).withContext('the token resolves').toBe('4px');
        const bareControl = bare.querySelector<HTMLElement>(
          '.maplibregl-ctrl-attrib',
        )!;
        const bareButton = bare.querySelector<HTMLElement>(
          '.maplibregl-ctrl-attrib-button',
        )!;
        expect(getComputedStyle(bareControl).borderRadius)
          .withContext('MapLibre alone rounds the open control to a pill')
          .toBe('12px');
        expect(getComputedStyle(bareButton).borderRadius)
          .withContext('and its info button to a circle')
          .toBe('12px');

        const attribution = addAttributionControl(
          fixture.nativeElement.querySelector('.spot-map__canvas'),
          360,
          corner,
        );
        const button = attribution.querySelector<HTMLElement>(
          '.maplibregl-ctrl-attrib-button',
        )!;
        fake.emit('load');
        expect(attribution.classList)
          .withContext('narrow map: collapsed to the info button')
          .not.toContain('maplibregl-compact-show');
        expect(getComputedStyle(attribution).borderRadius)
          .withContext('collapsed to the info button')
          .toBe(softCorner);
        attribution.classList.add('maplibregl-compact-show');
        expect(getComputedStyle(attribution).borderRadius)
          .withContext('opened by the visitor')
          .toBe(softCorner);
        expect(getComputedStyle(button).borderRadius)
          .withContext('the info button is no circle')
          .toBe(softCorner);
      } finally {
        bare.remove();
        mapLibreRules.remove();
      }
    });
  }

  it('asks for the DEM depth its city has, so no city requests tiles that do not exist', async () => {
    const asked: number[] = [];
    loadElevation = (demMaxzoom) => {
      asked.push(demMaxzoom);
      return Promise.resolve(null);
    };
    await create({ city: CityEnum.Split });
    fake.emit('load');
    await fixture.whenStable();
    expect(asked).toEqual([12, 12]);
  });

  it('asks for the survey depth for a city Mapterhorn has a survey for', async () => {
    const asked: number[] = [];
    loadElevation = (demMaxzoom) => {
      asked.push(demMaxzoom);
      return Promise.resolve(null);
    };
    await create();
    fake.emit('load');
    await fixture.whenStable();
    expect(asked).toEqual([14, 14]);
  });

  it('builds the map already framed', async () => {
    await create();
    expect(mapFactory.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        bounds: [
          [16.37, 48.2],
          [16.4, 48.22],
        ],
        fitBoundsOptions: { padding: 48, maxZoom: 16 },
      }),
    );
    fake.emit('load');
    expect(fake.cameraMoves).toEqual([]);
  });

  it('opens on the framed city with no opening camera move, reduced motion or not', async () => {
    // MapLibre applies the `bounds` option with `duration: 0` in its constructor, so `load` paints
    // the city already framed and nothing is left to ease into view, whichever motion preference
    // is set.
    requestReducedMotion(true);
    await create();
    fake.emit('load');
    expect(fake.cameraMoves)
      .withContext('camera moves with reduced motion asked for')
      .toEqual([]);

    requestReducedMotion(false);
    await retry(1);
    fake.emit('load');
    expect(fake.cameraMoves)
      .withContext('camera moves with reduced motion not asked for')
      .toEqual([]);
  });

  it('emits ready once the map reports load and its pins are drawn', async () => {
    const c = await create();
    const ready = jasmine.createSpy('ready');
    c.ready.subscribe(ready);
    fake.emit('load');
    fake.drawPins();
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
    fake.drawPins();
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
    fake.drawPins();
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
    fake.drawPins();
    expect(failed).not.toHaveBeenCalled();
    expect(fake.removed).toBe(false);
    expect(ready).toHaveBeenCalled();
  });

  it('logs an error it paints through instead of swallowing it', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    c.failed.subscribe(failed);
    fake.emit('load');
    // Attaching an `error` listener took MapLibre's own logging away: `Evented.fire` writes an
    // error to the console only while nothing listens for it. A dead glyph endpoint drops every
    // label off a map that still paints, and without this the only diagnostic left for that is
    // the raw network tab.
    const logged = spyOn(console, 'error');
    fake.failOneResource();
    expect(failed).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    expect(logged.calls.mostRecent().args.join(' ')).toContain(
      'one tile failed to load',
    );
  });

  it('logs the error behind a map it gives up on', async () => {
    // `> SIGNAL LOST // MAP UNREACHABLE` is all the user gets; without this the console never
    // says which resource took the map down.
    await create();
    const logged = spyOn(console, 'error');
    fake.failBasemapSource();
    expect(logged).toHaveBeenCalled();
    expect(logged.calls.mostRecent().args.join(' ')).toContain(
      'https://tiles.openfreemap.org/planet',
    );
  });

  it('never reports ready for a map it has already given up on', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    const ready = jasmine.createSpy('ready');
    c.failed.subscribe(failed);
    c.ready.subscribe(ready);
    fake.failBasemapSource();
    // MapLibre fires `load` even for a map whose source died, because the render loop fires it
    // once `Map.loaded()` is true, and that reads the same short-circuited `Style.loaded()`.
    fake.emit('load');
    fake.drawPins();
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
    expect(mapFactory).not.toHaveBeenCalled();
  });

  it('still reports the spot list on a browser without WebGL, so the list works beside the failure chrome', async () => {
    getContext.and.returnValue(null);
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    const failed = jasmine.createSpy('failed');
    const loaded: SpotListCollection[] = [];
    const events: MapLoadEvent[] = [];
    fixture.componentInstance.failed.subscribe(failed);
    fixture.componentInstance.spotsLoaded.subscribe((c) => loaded.push(c));
    fixture.componentInstance.loadEvent.subscribe((e) => events.push(e));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(failed)
      .withContext('no waiting on the network')
      .toHaveBeenCalledWith('unsupported');
    const requests = httpMock.match('spots/vienna.geojson');
    expect(requests.length).toBe(1);
    requests[0]?.flush(COLLECTION);
    // Lets the spot list's promise chain settle: `whenStable()` does not wait for it.
    await new Promise((resolve) => setTimeout(resolve));
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.features.map((f) => f.properties.id)).toEqual(['a', 'b']);
    expect(events.map((e) => e.kind)).toContain('spots-done');
    expect(mapFactory).not.toHaveBeenCalled();
  });

  describe('the spot list beside a map that cannot paint', () => {
    /** Both spots of {@link COLLECTION}, A–Z, as the list shows them. */
    const ALL_SPOT_IDS = ['a', 'b'];

    let pageInjector: EnvironmentInjector;

    afterEach(() => pageInjector.destroy());

    /**
     * Wires `component` to a page store the way the map page's template does — `spotsLoaded` into
     * `setList`, `boundsChange` into `setBounds` — so a spec reads what a visitor's list would show.
     */
    function listOf(component: SpotMapComponent): () => string[] | null {
      pageInjector = createEnvironmentInjector(
        [provideRouter([]), provideLocationMocks(), SpotBrowserStore],
        TestBed.inject(EnvironmentInjector),
      );
      const store = pageInjector.get(SpotBrowserStore);
      component.spotsLoaded.subscribe((list) => store.setList(list));
      component.boundsChange.subscribe((bounds) => store.setBounds(bounds));
      return () =>
        store.shownSpots()?.map((spot) => spot.properties.id) ?? null;
    }

    /** Starts a build the spec has wired to a store, with its spots request unanswered. */
    function startBuild() {
      fixture = TestBed.createComponent(SpotMapComponent);
      fixture.componentRef.setInput('city', CityEnum.Vienna);
      fixture.componentRef.setInput('retryToken', 0);
      const shown = listOf(fixture.componentInstance);
      fixture.detectChanges();
      return shown;
    }

    /** Answers the unanswered spots request and lets the build's promise chain settle. */
    async function answerSpots() {
      httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }

    it('lists every spot when the browser has no WebGL, as no spot is out of view of a map that is not there', async () => {
      getContext.and.returnValue(null);
      const shown = startBuild();
      await answerSpots();
      expect(shown()).toEqual(ALL_SPOT_IDS);
    });

    it('lists every spot when the map is refused after the spots arrived', async () => {
      spyOn(console, 'error');
      mapFactory.and.callFake(() => Promise.reject(new Error('no context')));
      const shown = startBuild();
      await answerSpots();
      expect(shown()).toEqual(ALL_SPOT_IDS);
    });

    it('lists every spot when the basemap dies before the map paints', async () => {
      const shown = startBuild();
      await answerSpots();
      expect(shown()).withContext('no view known yet').toBeNull();
      fake.failBasemapSource();
      expect(shown()).toEqual(ALL_SPOT_IDS);
    });

    it('keeps the list a painted map shows when a late error names a dead source', async () => {
      const shown = startBuild();
      await answerSpots();
      fake.emit('load');
      const inView = shown();
      expect(inView)
        .withContext('the fake map’s view holds no spot')
        .toEqual([]);
      fake.failBasemapSource();
      expect(shown()).toEqual(inView);
    });
  });

  it('fails as unsupported on a browser whose WebGL stops at version 1', async () => {
    // maplibre-gl v6 asks for one context and one only: `Map._setupPainter()` requests `webgl2`
    // and throws `GPUInitializationError` — "WebGL2 is required to display this map" — the
    // moment it comes back null, and the `Map` constructor rethrows it after cleaning up its
    // container. So a browser that answers `getContext('webgl')` but not `getContext('webgl2')`
    // — iOS 14, older Android WebViews, a GPU blocklist that stops at WebGL2 — cannot draw this
    // map at all.
    getContext.and.callFake((contextId: string) =>
      contextId === 'webgl2'
        ? null
        : ({
            getExtension: () => ({ loseContext }),
          } as unknown as WebGLRenderingContext),
    );
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    const failed = jasmine.createSpy('failed');
    fixture.componentInstance.failed.subscribe(failed);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(failed).toHaveBeenCalledWith('unsupported');
    expect(mapFactory).not.toHaveBeenCalled();
  });

  it('reports a map whose renderer never arrives as unreachable', async () => {
    // The lazy maplibre-gl chunk failing to load: after a redeploy a client holding a cached
    // index.html asks for a hashed chunk that is gone, so `import('maplibre-gl')` rejects and
    // the factory rejects with it. Unreported, the container hears nothing at all and sits on
    // the spinner until its own 15 s watchdog guesses.
    mapFactory.and.callFake(() =>
      Promise.reject(new Error('map chunk failed to load')),
    );
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    const failed = jasmine.createSpy('failed');
    fixture.componentInstance.failed.subscribe(failed);
    fixture.detectChanges();
    httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
    await fixture.whenStable();
    expect(failed).toHaveBeenCalledWith('unreachable');
  });

  it('logs the reason a map that never got a renderer went down', async () => {
    // The factory is the one failure with nothing else to name it: `> SIGNAL LOST // MAP
    // UNREACHABLE` is all the user sees, no MapLibre `error` event ever fires because no map was
    // built, and the network tab shows a 404 without saying what asked for it. Swallowing the
    // rejection also took away the unhandled-rejection report the browser used to print, since
    // `build()` is launched with `void`.
    mapFactory.and.callFake(() =>
      Promise.reject(new Error('map chunk failed to load')),
    );
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    const logged = spyOn(console, 'error');
    fixture.detectChanges();
    httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
    await fixture.whenStable();
    expect(logged).toHaveBeenCalled();
    expect(logged.calls.mostRecent().args.join(' ')).toContain(
      'map chunk failed to load',
    );
  });

  it('reports a map the GPU refused to build as unreachable, not unsupported', async () => {
    // `new Map(...)` rethrowing `GPUInitializationError` inside the async factory, even though
    // the probe just held a WebGL2 context: the context could not be created *this time* — one
    // live context too many, a driver that dropped out. The probe already turned away the
    // browsers that can never render, so this is a build that failed rather than a browser that
    // is out, and RETRY may well get a context.
    const gpuError = new Error('WebGL2 is required to display this map.');
    gpuError.name = 'GPUInitializationError';
    mapFactory.and.callFake(() => Promise.reject(gpuError));
    fixture = TestBed.createComponent(SpotMapComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', 0);
    const failed = jasmine.createSpy('failed');
    fixture.componentInstance.failed.subscribe(failed);
    fixture.detectChanges();
    httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
    await fixture.whenStable();
    expect(failed).toHaveBeenCalledWith('unreachable');
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

  describe('a spots request that a newer build has replaced', () => {
    /** Starts a build and leaves its spots request unanswered. */
    function startBuild(): { request: TestRequest; failed: jasmine.Spy } {
      fixture = TestBed.createComponent(SpotMapComponent);
      fixture.componentRef.setInput('city', CityEnum.Vienna);
      fixture.componentRef.setInput('retryToken', 0);
      const failed = jasmine.createSpy('failed');
      fixture.componentInstance.failed.subscribe(failed);
      fixture.detectChanges();
      return { request: httpMock.expectOne('spots/vienna.geojson'), failed };
    }

    it('is cancelled by a city switch, which asks only for the new city', async () => {
      const { request, failed } = startBuild();
      expect(request.cancelled).toBeFalse();
      fixture.componentRef.setInput('city', CityEnum.Graz);
      fixture.detectChanges();
      expect(request.cancelled).toBeTrue();
      const current = httpMock.expectOne('spots/graz.geojson');
      expect(current.cancelled).toBeFalse();
      current.flush(COLLECTION);
      await fixture.whenStable();
      expect(failed).not.toHaveBeenCalled();
      expect(mapFactory).toHaveBeenCalledTimes(1);
    });

    it('is cancelled by a retry', () => {
      const { request } = startBuild();
      fixture.componentRef.setInput('retryToken', 1);
      fixture.detectChanges();
      expect(request.cancelled).toBeTrue();
      httpMock.expectOne('spots/vienna.geojson');
    });

    it('is cancelled when the component is destroyed', () => {
      const { request } = startBuild();
      fixture.destroy();
      expect(request.cancelled).toBeTrue();
    });
  });

  describe('the visitor’s hold on the map', () => {
    it('stops listening for pointers once the component is destroyed', async () => {
      await create();
      const removed = spyOn(window, 'removeEventListener').and.callThrough();
      fixture.destroy();
      const types = removed.calls.allArgs().map(([type]) => type);
      expect(types).toContain('pointerup');
      expect(types).toContain('pointercancel');
      // They were added in the capture phase, and removal must name that phase to find them.
      const captured = removed.calls
        .allArgs()
        .filter(([, , capture]) => capture === true)
        .map(([type]) => type);
      expect(captured).toContain('pointerup');
      expect(captured).toContain('pointercancel');
    });
  });

  it('marks the pins as pointer targets while the cursor is over one', async () => {
    await create();
    fake.emit('load');
    pointerOver('a');
    fake.emit('mousemove', { point: { x: 1, y: 1 } });
    expect(fake.canvas.style.cursor).toBe('pointer');
    pointerOver(null);
    fake.emit('mousemove', { point: { x: 1, y: 1 } });
    expect(fake.canvas.style.cursor).toBe('');
    pointerOver('a');
    fake.emit('mousemove', { point: { x: 1, y: 1 } });
    fake.emit('mouseout');
    expect(fake.canvas.style.cursor).toBe('');
  });

  describe('pins drawn as photos and the flag', () => {
    beforeEach(() => {
      backend = {
        ...UNCONFIGURED_BACKEND,
        photoBaseUrl: 'https://photos.test',
      };
    });

    it('takes a tap on another spot’s photo as a switch to that spot, never as an empty tap', async () => {
      const c = await create({ selectedId: 'a' });
      fake.emit('load');
      const clicks: string[] = [];
      const empty = jasmine.createSpy('emptyClick');
      c.spotClick.subscribe((id) => clicks.push(id));
      c.emptyClick.subscribe(empty);
      fake.placedPhotos = [{ id: 'b', properties: { id: 'b' } }];
      fake.emit('click', { point: { x: 1, y: 1 } });
      expect(clicks).toEqual(['b']);
      expect(empty).not.toHaveBeenCalled();
    });

    it('takes a tap on the flag as a tap on its spot', async () => {
      const c = await create({ selectedId: 'a' });
      fake.emit('load');
      const clicks: string[] = [];
      c.spotClick.subscribe((id) => clicks.push(id));
      fake.renderedFlags = [tapOn('a').features[0]];
      fake.emit('click', { point: { x: 1, y: 1 } });
      expect(clicks).toEqual(['a']);
    });

    it('gives the pointer cursor and the hover over a photo', async () => {
      requestHoverPointer(true);
      const c = await create();
      fake.emit('load');
      const hovers: (string | null)[] = [];
      c.pinHover.subscribe((id) => hovers.push(id));
      fake.placedPhotos = [{ id: 'b', properties: { id: 'b' } }];
      fake.emit('mousemove', { point: { x: 1, y: 1 } });
      expect(fake.canvas.style.cursor).toBe('pointer');
      expect(hovers).toEqual(['b']);
    });

    describe('a dot that shows through the transparent stem band of a neighbour’s photo frame', () => {
      /** Spot `a`'s pin, with its photo frame standing above it. */
      const FRAMED_PIN = { x: 500, y: 300 };
      /**
       * Spot `b`'s dot, 12 px above `a`'s pin: inside the 8 px stem band at the foot of the frame's
       * icon box, which the photo layer reports as hit although nothing opaque is drawn there.
       */
      const DOT_IN_STEM_BAND = { x: 500, y: 288 };
      /** Spot `b`'s dot behind the frame's body, hidden by it. */
      const DOT_UNDER_BODY = { x: 500, y: 270 };

      /** Both spots on screen, `a` framed as a photo, and `b`'s dot at `dot`. */
      async function frameWithDotAt(dot: { x: number; y: number }) {
        const c = await create();
        fake.emit('load');
        fake.projectedAt = ([lng]) => (lng === 16.37 ? FRAMED_PIN : dot);
        fake.placedPhotos = [{ id: 'a', properties: { id: 'a' } }];
        // Both thumb targets reach the pointer: they are 22 px circles round each pin.
        fake.renderedPins = [...tapOn('a').features, ...tapOn('b').features];
        return c;
      }

      it('opens the dot’s spot, not the frame’s', async () => {
        const c = await frameWithDotAt(DOT_IN_STEM_BAND);
        const clicks: string[] = [];
        c.spotClick.subscribe((id) => clicks.push(id));
        fake.emit('click', { point: DOT_IN_STEM_BAND });
        expect(clicks).toEqual(['b']);
      });

      it('hovers the dot’s spot, not the frame’s', async () => {
        requestHoverPointer(true);
        const c = await frameWithDotAt(DOT_IN_STEM_BAND);
        const hovers: (string | null)[] = [];
        c.pinHover.subscribe((id) => hovers.push(id));
        fake.emit('mousemove', { point: DOT_IN_STEM_BAND });
        expect(hovers).toEqual(['b']);
      });

      it('still opens the frame’s spot where its opaque body hides a dot', async () => {
        const c = await frameWithDotAt(DOT_UNDER_BODY);
        const clicks: string[] = [];
        c.spotClick.subscribe((id) => clicks.push(id));
        fake.emit('click', { point: DOT_UNDER_BODY });
        expect(clicks).toEqual(['a']);
      });

      it('opens the frame’s own spot from its own stem band', async () => {
        const c = await frameWithDotAt(DOT_UNDER_BODY);
        const clicks: string[] = [];
        c.spotClick.subscribe((id) => clicks.push(id));
        // 12 px above `a`'s pin, in the band, with `b`'s dot a long way off.
        fake.emit('click', { point: { x: 500, y: 288 } });
        expect(clicks).toEqual(['a']);
      });
    });

    it('asks about the photo pins and the flag as well as the thumb target', async () => {
      await create();
      fake.emit('load');
      const query = spyOn(fake, 'queryRenderedFeatures').and.callThrough();
      fake.emit('click', { point: { x: 1, y: 1 } });
      expect(queriedLayers(query)).toEqual(
        jasmine.arrayWithExactContents([
          'spots-hit',
          'spots-photo',
          'spots-flag',
        ]),
      );
    });
  });

  it('asks only about the thumb target when there are no photo layers to ask about', async () => {
    await create();
    fake.emit('load');
    const query = spyOn(fake, 'queryRenderedFeatures').and.callThrough();
    fake.emit('click', { point: { x: 1, y: 1 } });
    expect(queriedLayers(query)).toEqual(['spots-hit']);
  });

  describe('the selection', () => {
    it('reports a pin tap as a spotClick and selects nothing by itself', async () => {
      const c = await create();
      fake.emit('load');
      const clicks: string[] = [];
      c.spotClick.subscribe((id) => clicks.push(id));
      await tap('a');
      expect(clicks).toEqual(['a']);
      expect(fake.featureStates['a']).toBeUndefined();
    });

    it('selects the pin selectedId names, with the lock-on pulse', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create();
      fake.emit('load');
      select('a');
      expect(fake.featureStates['a']?.['selected']).toBe(true);
      expect(fake.lastLockOnFilter()).toEqual(onlySpot('a'));
    });

    it('moves the selection when selectedId changes, and clears it on null', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create();
      fake.emit('load');
      select('a');
      select('b');
      expect(fake.featureStates['a']?.['selected']).toBeUndefined();
      expect(fake.featureStates['b']?.['selected']).toBe(true);
      select(null);
      expect(fake.featureStates['b']?.['selected']).toBeUndefined();
      expect(fake.lastLockOnFilter()).toBe(LOCK_ON_AT_REST_FILTER);
    });

    it('waits for the pins before it selects, then shows a selection the map was built with without the pulse', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create({ selectedId: 'b' });
      expect(fake.featureStates['b'])
        .withContext('no spot source before load')
        .toBeUndefined();
      fake.emit('load');
      expect(fake.featureStates['b']?.['selected']).toBe(true);
      expect(fake.filterCalls.filter((call) => call.layer === 'spots-lock-on'))
        .withContext('a shared link or a rebuild is no tap: no lock-on')
        .toEqual([]);
    });

    it('reports a map click that misses every pin as emptyClick, and not one on a pin', async () => {
      const c = await create();
      fake.emit('load');
      const empty = jasmine.createSpy('emptyClick');
      c.emptyClick.subscribe(empty);
      fake.renderedPins = [{}];
      fake.emit('click', { point: { x: 1, y: 1 } });
      expect(empty).withContext('a click on a pin').not.toHaveBeenCalled();
      fake.renderedPins = [];
      fake.emit('click', { point: { x: 1, y: 1 } });
      expect(empty).toHaveBeenCalledTimes(1);
    });

    it('reports the loaded spots in the list shape before the map paints, and feeds the pins that shape', async () => {
      fixture = TestBed.createComponent(SpotMapComponent);
      const loaded: SpotListCollection[] = [];
      fixture.componentInstance.spotsLoaded.subscribe((c) => loaded.push(c));
      fixture.componentRef.setInput('city', CityEnum.Vienna);
      fixture.componentRef.setInput('retryToken', 0);
      fixture.detectChanges();
      httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
      await fixture.whenStable();
      const expected: SpotListCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [16.37, 48.2] },
            properties: {
              id: 'a',
              name: 'Alpha Bank',
              status: 'active',
              cover: 'spots/vienna/a-1.webp',
              photoCount: 1,
            },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [16.4, 48.22] },
            properties: {
              id: 'b',
              name: 'Beta Ledge',
              status: 'demolished',
              cover: 'spots/vienna/b-1.webp',
              photoCount: 1,
            },
          },
        ],
      };
      expect(loaded).toEqual([expected]);
      fake.emit('load');
      expect((fake.sources['spots'] as { data: unknown }).data).toEqual(
        expected,
      );
    });

    it('reports only the spots of the build a city switch left standing', async () => {
      fixture = TestBed.createComponent(SpotMapComponent);
      const loaded: SpotListCollection[] = [];
      fixture.componentInstance.spotsLoaded.subscribe((c) => loaded.push(c));
      fixture.componentRef.setInput('city', CityEnum.Vienna);
      fixture.componentRef.setInput('retryToken', 0);
      fixture.detectChanges();
      httpMock.expectOne('spots/vienna.geojson');
      fixture.componentRef.setInput('city', CityEnum.Graz);
      fixture.detectChanges();
      httpMock.expectOne('spots/graz.geojson').flush(COLLECTION);
      await fixture.whenStable();
      expect(loaded.length).toBe(1);
    });
  });

  it('builds and paints a flat map when elevation is unavailable', async () => {
    elevation = null;
    const c = await create();
    const ready = jasmine.createSpy('ready');
    c.ready.subscribe(ready);
    expect(Object.keys(fake.style?.sources ?? {})).toEqual(['openmaptiles']);
    fake.emit('load');
    fake.drawPins();
    expect(ready).toHaveBeenCalled();
  });

  it('opens on the flat city and adds the terrain once the map has loaded', async () => {
    // MapLibre fires `load` only once every source in the style has its visible tiles, so terrain
    // in the opening style would hold the pins back behind the slowest DEM tile.
    elevation = ELEVATION_TILES;
    await create();
    expect(Object.keys(fake.style?.sources ?? {})).toEqual(['openmaptiles']);
    fake.emit('load');
    await fixture.whenStable();
    expect(Object.keys(fake.sources)).toEqual(['spots', 'dem', 'contours']);
  });

  it('paints the pins and reports ready while the terrain is still loading', async () => {
    holdElevation();
    const c = await create();
    const ready = jasmine.createSpy('ready');
    c.ready.subscribe(ready);
    fake.emit('load');
    fake.drawPins();
    expect(ready).toHaveBeenCalled();
    expect(fake.sources['spots'])
      .withContext('the pins are drawn')
      .toBeDefined();
    expect(mapFactory.calls.mostRecent().args[0].bounds)
      .withContext('the spots are framed')
      .toBeDefined();
  });

  it('slots the terrain under the basemap layers the design sets once it arrives', async () => {
    const resolveElevation = holdElevation();
    await create();
    fake.emit('load');
    expect(fake.terrainLayers())
      .withContext('no terrain before the loader resolves')
      .toEqual([]);
    resolveElevation(ELEVATION_TILES);
    await fixture.whenStable();
    expect(Object.keys(fake.sources)).toEqual(['spots', 'dem', 'contours']);
    expect(fake.terrainLayers()).toEqual(ELEVATION_LAYERS);
  });

  it('gives the terrain a fresh time box from the map load, not from the build start', async () => {
    // The early call only warms the loader; on a slow phone its time box has run out by the time
    // `load` arrives, so the relief rides on a second call made after `load`.
    const calls: string[] = [];
    loadElevation = () => {
      calls.push(calls.length === 0 ? 'early' : 'after load');
      return Promise.resolve(calls.length === 1 ? null : ELEVATION_TILES);
    };
    await create();
    expect(calls)
      .withContext('only the warm-up before load')
      .toEqual(['early']);
    fake.emit('load');
    await fixture.whenStable();
    expect(calls).toEqual(['early', 'after load']);
    expect(Object.keys(fake.sources)).toEqual(['spots', 'dem', 'contours']);
    expect(fake.terrainLayers()).toEqual(ELEVATION_LAYERS);
  });

  it('stays flat when the terrain loader resolves to nothing', async () => {
    const resolveElevation = holdElevation();
    await create();
    fake.emit('load');
    resolveElevation(null);
    await fixture.whenStable();
    expect(Object.keys(fake.sources)).toEqual(['spots']);
    expect(fake.terrainLayers()).toEqual([]);
  });

  it('adds no terrain to a map a city switch replaced while the terrain was loading', async () => {
    const resolveElevation = holdElevation();
    await create();
    fake.emit('load');
    const replaced = fake;
    fake = new FakeMap();
    fixture.componentRef.setInput('city', CityEnum.Graz);
    fixture.detectChanges();
    httpMock.expectOne('spots/graz.geojson').flush(COLLECTION);
    await fixture.whenStable();
    fake.emit('load');
    resolveElevation(ELEVATION_TILES);
    await fixture.whenStable();
    expect(replaced.removed)
      .withContext('the switch released the old map')
      .toBe(true);
    expect(Object.keys(replaced.sources)).toEqual(['spots']);
    expect(replaced.terrainLayers()).toEqual([]);
    expect(fake.terrainLayers())
      .withContext('the map that replaced it gets the terrain')
      .toEqual(ELEVATION_LAYERS);
  });

  it('adds no terrain to a map destroyed while the terrain was loading', async () => {
    const resolveElevation = holdElevation();
    await create();
    fake.emit('load');
    fixture.destroy();
    resolveElevation(ELEVATION_TILES);
    await fixture.whenStable();
    expect(fake.removed).withContext('the map was released').toBe(true);
    expect(Object.keys(fake.sources)).toEqual(['spots']);
    expect(fake.terrainLayers()).toEqual([]);
  });

  it('logs terrain it cannot add, and keeps the painted map', async () => {
    const resolveElevation = holdElevation();
    const c = await create();
    const failed = jasmine.createSpy('failed');
    c.failed.subscribe(failed);
    fake.emit('load');
    const addSource = fake.addSource.bind(fake);
    spyOn(fake, 'addSource').and.callFake((id: string, source: unknown) => {
      if (id === 'dem') {
        throw new Error('There is already a source with ID "dem"');
      }
      addSource(id, source);
    });
    const logged = spyOn(console, 'error');
    resolveElevation(ELEVATION_TILES);
    await fixture.whenStable();
    expect(logged).toHaveBeenCalled();
    expect(logged.calls.mostRecent().args.join(' ')).toContain(
      'already a source with ID "dem"',
    );
    expect(failed).not.toHaveBeenCalled();
    expect(fake.removed).toBe(false);
  });

  it('paints on through a terrain source that never comes up, and says so', async () => {
    elevation = ELEVATION_TILES;
    const c = await create();
    const failed = jasmine.createSpy('failed');
    const ready = jasmine.createSpy('ready');
    c.failed.subscribe(failed);
    c.ready.subscribe(ready);
    fake.emit('load');
    fake.drawPins();
    await fixture.whenStable();
    expect(fake.sources['dem'])
      .withContext('the terrain was added')
      .toBeDefined();
    const logged = spyOn(console, 'error');
    fake.failTerrainSource('dem');
    fake.failTerrainSource('contours');
    expect(failed).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('still gives up on a basemap that never comes up beside the terrain', async () => {
    elevation = ELEVATION_TILES;
    const c = await create();
    const failed = jasmine.createSpy('failed');
    c.failed.subscribe(failed);
    fake.failBasemapSource();
    expect(failed).toHaveBeenCalledWith('unreachable');
  });

  it('stops the lock-on before the map is torn down', async () => {
    requestReducedMotion(false);
    const cancelFrame = holdAnimationFrames();
    await create();
    fake.emit('load');
    select('a');
    fixture.destroy();
    expect(cancelFrame).toHaveBeenCalled();
    expect(fake.paintCallsAfterRemoval)
      .withContext('the ring was put to rest on a map already removed')
      .toEqual([]);
    expect(fake.filterCallsAfterRemoval)
      .withContext('the ring was unfiltered on a map already removed')
      .toEqual([]);
    expect(fake.lastLockOnPaint('circle-stroke-opacity')).toEqual(
      LOCK_ON_AT_REST,
    );
    expect(fake.lastLockOnFilter()).toBe(LOCK_ON_AT_REST_FILTER);
    expect(fake.removed).toBe(true);
  });

  describe('load progress', () => {
    /** Builds the map with every load event recorded from the very first one. */
    async function createRecording() {
      fixture = TestBed.createComponent(SpotMapComponent);
      const events: MapLoadEvent[] = [];
      fixture.componentInstance.loadEvent.subscribe((event) =>
        events.push(event),
      );
      fixture.componentRef.setInput('city', CityEnum.Vienna);
      fixture.componentRef.setInput('retryToken', 0);
      fixture.detectChanges();
      httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
      await fixture.whenStable();
      fixture.detectChanges();
      return events;
    }

    /** One basemap tile event, in the shape MapLibre re-fires on the map. */
    const basemapTile = { sourceId: BASEMAP_SOURCE_ID, tile: {} };

    const tileEvents = (events: MapLoadEvent[]) =>
      events.filter((event) => event.kind === 'tiles');

    it('reports the load milestones in order', async () => {
      const events = await createRecording();
      fake.emit('style.load');
      fake.emit('sourcedataloading', basemapTile);
      fake.emit('sourcedataloading', basemapTile);
      fake.emit('sourcedata', basemapTile);
      fake.emit('load');
      expect(events.map((event) => event.kind)).toEqual([
        'spots-sent',
        'spots-done',
        'renderer-ready',
        'style-loaded',
        'tiles',
        'tiles',
        'tiles',
        'painted',
      ]);
      expect(tileEvents(events).at(-1)).toEqual({
        kind: 'tiles',
        loaded: 1,
        requested: 2,
      });
    });

    it('counts an aborted tile out of the total', async () => {
      const events = await createRecording();
      fake.emit('sourcedataloading', basemapTile);
      fake.emit('sourcedataloading', basemapTile);
      fake.emit('sourcedataabort', basemapTile);
      expect(tileEvents(events).at(-1)).toEqual({
        kind: 'tiles',
        loaded: 0,
        requested: 1,
      });
    });

    it('ignores tiles of any source but the basemap', async () => {
      // Relief is decoration and must never hold the reveal, so its tiles never count.
      const events = await createRecording();
      fake.emit('sourcedataloading', { sourceId: 'dem', tile: {} });
      fake.emit('sourcedata', { sourceId: 'dem', tile: {} });
      expect(tileEvents(events)).toEqual([]);
    });

    it('ignores tiles after the paint', async () => {
      const events = await createRecording();
      fake.emit('load');
      fake.emit('sourcedataloading', basemapTile);
      fake.emit('sourcedata', basemapTile);
      expect(tileEvents(events)).toEqual([]);
    });

    it('reports ready only once the pins are drawn, not on load', async () => {
      const c = await create();
      const ready = jasmine.createSpy('ready');
      c.ready.subscribe(ready);
      fake.emit('load');
      expect(ready).withContext('on load').not.toHaveBeenCalled();
      fake.emit('render');
      expect(ready)
        .withContext('a frame before the spot source loaded')
        .not.toHaveBeenCalled();
      fake.drawPins();
      expect(ready).toHaveBeenCalledTimes(1);
      fake.emit('render');
      expect(ready).toHaveBeenCalledTimes(1);
    });

    it('never reports ready for a map torn down before its pins were drawn', async () => {
      const c = await create();
      const ready = jasmine.createSpy('ready');
      c.ready.subscribe(ready);
      fake.emit('load');
      const old = fake;
      await retry(1);
      old.drawPins();
      expect(ready).not.toHaveBeenCalled();
    });
  });

  describe('the camera and the visible bounds', () => {
    /** The 1000 × 600 host's bottom 510 px, covered by a phone's sheet at detail height. */
    const SHEET_INSETS = { top: 0, right: 0, bottom: 510, left: 0 };
    const eases = () =>
      fake.cameraMoves.filter((move) => move.method === 'easeTo');

    it('reports the uncovered bounds when the map paints', async () => {
      const c = await create({
        insets: { top: 0, right: 0, bottom: 200, left: 0 },
      });
      const bounds: ViewBounds[] = [];
      c.boundsChange.subscribe((b) => bounds.push(b));
      fake.emit('load');
      expect(bounds.length).toBe(1);
      expect(bounds[0]).toEqual(
        jasmine.objectContaining({ west: 0, north: 50, east: 1 }),
      );
      expect(bounds[0]?.south).toBeCloseTo(49.6, 9);
    });

    it('reports the bounds at most once a frame while the map moves', async () => {
      const runFrames = captureFrames();
      const c = await create();
      fake.emit('load');
      const bounds: ViewBounds[] = [];
      c.boundsChange.subscribe((b) => bounds.push(b));
      fake.emit('move');
      fake.emit('move');
      fake.emit('move');
      runFrames();
      expect(bounds.length).toBe(1);
    });

    it('reports new bounds when the covered strip changes', async () => {
      const runFrames = captureFrames();
      const c = await create();
      fake.emit('load');
      const bounds: ViewBounds[] = [];
      c.boundsChange.subscribe((b) => bounds.push(b));
      fixture.componentRef.setInput('coveredInsets', {
        top: 0,
        right: 0,
        bottom: 300,
        left: 0,
      });
      fixture.detectChanges();
      runFrames();
      expect(bounds.at(-1)?.south).toBeCloseTo(49.7, 9);
    });

    it('reports nothing from a build a retry replaced', async () => {
      const runFrames = captureFrames();
      const c = await create();
      fake.emit('load');
      const old = fake;
      const bounds: ViewBounds[] = [];
      c.boundsChange.subscribe((b) => bounds.push(b));
      await retry(1);
      old.emit('move');
      runFrames();
      expect(bounds).toEqual([]);
    });

    it('cancels a pending bounds frame on teardown', async () => {
      captureFrames();
      await create();
      fake.emit('load');
      fake.emit('move');
      fixture.destroy();
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('eases a pin opened under a phone’s sheet into the strip above it', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create({ insets: SHEET_INSETS });
      fake.emit('load');
      select('a');
      expect(eases().at(-1)?.options).toEqual(
        jasmine.objectContaining({
          center: [16.37, 48.2],
          offset: [0, -255],
          duration: 330,
        }),
      );
    });

    it('keeps a phone’s map still for a pin already in the strip above the sheet', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      // A sheet at half the 600 px map leaves a 300 px strip; the pin sits in its middle.
      await create({ insets: { top: 0, right: 0, bottom: 300, left: 0 } });
      fake.emit('load');
      fake.projected = { x: 500, y: 150 };
      select('a');
      expect(eases()).toEqual([]);
      fake.projected = { x: 500, y: 290 };
      select('b');
      expect(eases().length)
        .withContext('a pin at the sheet’s edge is revealed')
        .toBe(1);
    });

    it('moves a wide map only for a pin off screen', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create();
      fake.emit('load');
      fake.projected = { x: 500, y: 300 };
      select('a');
      expect(eases()).withContext('the pin was in view').toEqual([]);
      fake.projected = { x: 20, y: 300 };
      select('b');
      expect(eases().length).toBe(1);
    });

    it('eases back to the view an open started from when the spot closes', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create({ insets: SHEET_INSETS });
      fake.emit('load');
      fake.center = { lng: 16.5, lat: 48.3 };
      fake.zoom = 12;
      select('a');
      select('b');
      select(null);
      expect(eases().at(-1)?.options).toEqual(
        jasmine.objectContaining({ center: [16.5, 48.3], zoom: 12 }),
      );
    });

    it('does not re-centre on a change detection that leaves the frame as it was', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create({ insets: SHEET_INSETS });
      fake.emit('load');
      select('a');
      const count = eases().length;
      fixture.componentRef.setInput('coveredInsets', { ...SHEET_INSETS });
      fixture.detectChanges();
      expect(eases().length).toBe(count);
    });

    it('builds a cold-opened map on the spot, jumps the pin into the strip and saves no view', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create({
        selectedId: 'a',
        openOn: { center: [16.37, 48.2], zoom: 16 },
        insets: SHEET_INSETS,
      });
      const options = mapFactory.calls.mostRecent().args[0];
      expect(options).toEqual(
        jasmine.objectContaining({ center: [16.37, 48.2], zoom: 16 }),
      );
      expect(options.bounds).toBeUndefined();
      expect(options.fitBoundsOptions).toBeUndefined();
      fake.emit('load');
      expect(eases()).toEqual([
        jasmine.objectContaining({
          method: 'easeTo',
          options: jasmine.objectContaining({ offset: [0, -255], duration: 0 }),
        }),
      ]);
      select(null);
      expect(eases().length).withContext('nothing to go back to').toBe(1);
    });

    it('never eases a map the visitor holds', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create({ insets: SHEET_INSETS });
      fake.emit('load');
      fake.touchDown();
      select('a');
      expect(eases()).toEqual([]);
    });

    it('moves the attribution to the top-right corner on the sheet layout', async () => {
      await create({ attributionCorner: 'top-right' });
      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('spot-map--attribution-top');
      const container = buildAttributionControl('bottom-right');
      host.querySelector('.spot-map__canvas')!.append(container);
      const corner = container.querySelector<HTMLElement>(
        '.maplibregl-ctrl-bottom-right',
      )!;
      expect(getComputedStyle(corner).top).toBe('0px');
      expect(getComputedStyle(corner).bottom).toBe('auto');
      fixture.componentRef.setInput('attributionCorner', 'bottom-right');
      fixture.detectChanges();
      expect(host.classList).not.toContain('spot-map--attribution-top');
    });
  });

  describe('photo pins, the flag and hover', () => {
    const PHOTO_HOST = 'https://photos.test';
    const withPhotoHost = () => {
      backend = { ...UNCONFIGURED_BACKEND, photoBaseUrl: PHOTO_HOST };
    };
    const filtersOn = (layer: string) =>
      fake.filterCalls.filter((c) => c.layer === layer);
    const tooltip = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        '.spot-map__tooltip',
      );

    it('adds no photo pins, flag or image resolver without a photo host', async () => {
      await create();
      fake.emit('load');
      expect(fake.layers.map((l) => l.id)).not.toContain('spots-photo');
      expect(fake.missingImageResolver).toBeNull();
    });

    it('adds the photo pins and the flag above the pins and under the dot footprints with a photo host, the resolver first', async () => {
      withPhotoHost();
      await create();
      spyOn(fake, 'addSource').and.callFake((id: string, source: unknown) => {
        expect(fake.missingImageResolver)
          .withContext('resolver before the pins')
          .not.toBeNull();
        fake.sources[id] = source;
      });
      fake.emit('load');
      expect(fake.layers.map((l) => l.id).slice(-3)).toEqual([
        'spots-photo',
        'spots-flag',
        'spots-footprint',
      ]);
    });

    it('flies the flag over a selected spot with a photo and lowers it on close', async () => {
      withPhotoHost();
      await create();
      fake.emit('load');
      select('a');
      expect(filtersOn('spots-flag').at(-1)?.filter).toEqual(flagFilter('a'));
      expect(filtersOn('spots-photo').at(-1)?.filter).toEqual(
        photoPinFilter('a'),
      );
      select(null);
      expect(filtersOn('spots-flag').at(-1)?.filter).toBe(FLAG_AT_REST_FILTER);
      expect(filtersOn('spots-photo').at(-1)?.filter).toEqual(HAS_COVER);
    });

    it('keeps the flag down for a selected spot with no photo', async () => {
      withPhotoHost();
      await create({
        collection: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [16.37, 48.2] },
              properties: {
                id: 'a',
                name: 'Alpha Bank',
                status: 'active',
                notes: null,
                photos: [],
              },
            },
          ],
        },
      });
      fake.emit('load');
      select('a');
      expect(filtersOn('spots-flag').at(-1)?.filter).toBe(FLAG_AT_REST_FILTER);
    });

    it('lights the pin hoveredId names and moves the light with it', async () => {
      await create();
      fake.emit('load');
      fixture.componentRef.setInput('hoveredId', 'a');
      fixture.detectChanges();
      expect(fake.featureStates['a']?.['hovered']).toBe(true);
      fixture.componentRef.setInput('hoveredId', 'b');
      fixture.detectChanges();
      expect(fake.featureStates['a']?.['hovered']).toBeUndefined();
      expect(fake.featureStates['b']?.['hovered']).toBe(true);
      fixture.componentRef.setInput('hoveredId', null);
      fixture.detectChanges();
      expect(fake.featureStates['b']?.['hovered']).toBeUndefined();
    });

    it('reports the pin under a hovering pointer once, and the pointer leaving it', async () => {
      requestHoverPointer(true);
      const c = await create();
      fake.emit('load');
      const hovers: (string | null)[] = [];
      c.pinHover.subscribe((id) => hovers.push(id));
      pointerOver('a');
      fake.emit('mousemove', { point: { x: 1, y: 1 } });
      fake.emit('mousemove', { point: { x: 2, y: 1 } });
      fake.emit('mouseout');
      expect(hovers).toEqual(['a', null]);
    });

    it('reports no hover from a pointer that cannot hover', async () => {
      requestHoverPointer(false);
      const c = await create();
      fake.emit('load');
      const hovers: (string | null)[] = [];
      c.pinHover.subscribe((id) => hovers.push(id));
      pointerOver('a');
      fake.emit('mousemove', { point: { x: 1, y: 1 } });
      fake.emit('mouseout');
      expect(hovers).toEqual([]);
    });

    it('shows the hovered spot’s name above its pin, and nothing for the selected spot', async () => {
      await create();
      fake.emit('load');
      fixture.componentRef.setInput('hoveredId', 'a');
      fixture.detectChanges();
      expect(tooltip()?.textContent).toContain('Alpha Bank');
      expect(tooltip()?.style.transform).toBe('translate(500px, 300px)');
      expect(tooltip()?.querySelector('img'))
        .withContext('no photo host, so a name-only plate')
        .toBeNull();
      select('a');
      expect(tooltip()).toBeNull();
    });

    it('shows the cover photo in the tooltip with a photo host', async () => {
      withPhotoHost();
      await create();
      fake.emit('load');
      fixture.componentRef.setInput('hoveredId', 'a');
      fixture.detectChanges();
      expect(tooltip()?.querySelector('img')?.getAttribute('src')).toBe(
        `${PHOTO_HOST}/thumb/spots/vienna/a-1.webp`,
      );
    });

    it('moves the tooltip with the map, once a frame', async () => {
      const runFrames = captureFrames();
      await create();
      fake.emit('load');
      fixture.componentRef.setInput('hoveredId', 'a');
      fixture.detectChanges();
      fake.projected = { x: 100, y: 200 };
      fake.emit('move');
      runFrames();
      fixture.detectChanges();
      expect(tooltip()?.style.transform).toBe('translate(100px, 200px)');
    });

    it('fades the tooltip out instead of cutting it', async () => {
      await create();
      fake.emit('load');
      fixture.componentRef.setInput('hoveredId', 'a');
      fixture.detectChanges();
      const anchor = tooltip()!;
      expect(getComputedStyle(anchor).transitionProperty).toContain('opacity');
      // Read the leave's end state, not the fade's first frame.
      anchor.style.transition = 'none';
      anchor.classList.add('spot-map__tooltip--leaving');
      expect(getComputedStyle(anchor).opacity).toBe('0');
    });

    it('swaps in a new tooltip for the next spot rather than moving the old one', async () => {
      await create();
      fake.emit('load');
      fixture.componentRef.setInput('hoveredId', 'a');
      fixture.detectChanges();
      const first = tooltip();
      fixture.componentRef.setInput('hoveredId', 'b');
      fixture.detectChanges();
      expect(tooltip()?.textContent).toContain('Beta Ledge');
      expect(tooltip()).not.toBe(first);
    });

    it('reports the hover gone when a city change tears the hovered map down', async () => {
      requestHoverPointer(true);
      const c = await create();
      fake.emit('load');
      const hovers: (string | null)[] = [];
      c.pinHover.subscribe((id) => hovers.push(id));
      pointerOver('a');
      fake.emit('mousemove', { point: { x: 1, y: 1 } });
      await retry(1);
      expect(hovers).toEqual(['a', null]);
    });

    it('lets go of the photo pins on teardown', async () => {
      withPhotoHost();
      await create();
      fake.emit('load');
      fixture.destroy();
      expect(fake.handlers.get('idle')).toEqual([]);
    });
  });

  describe('keeping the selected flag on the map', () => {
    const SHEET_INSETS = { top: 0, right: 0, bottom: 510, left: 0 };
    const eases = () =>
      fake.cameraMoves.filter((move) => move.method === 'easeTo');
    beforeEach(() => {
      requestReducedMotion(false);
      holdAnimationFrames();
      backend = {
        ...UNCONFIGURED_BACKEND,
        photoBaseUrl: 'https://photos.test',
      };
    });

    it('moves a wide map for a pin whose flag would be clipped at the top edge', async () => {
      await create();
      fake.emit('load');
      fake.projected = { x: 500, y: 50 };
      select('a');
      expect(eases().length).toBe(1);
    });

    it('seats a pin on a phone lower in the strip, to make room for the flag above it', async () => {
      await create({ insets: SHEET_INSETS });
      fake.emit('load');
      select('a');
      // The 600 px map's strip above the 510 px sheet is 90 px tall, its middle 255 px up from the
      // canvas centre. The pin is lowered by half the flag's reach, but only as far as the strip
      // has room for the pin's ring on each side of its middle.
      const stripHeight = 600 - SHEET_INSETS.bottom;
      const lowering = Math.min(
        FLAG_REACH_PX / 2,
        stripHeight / 2 - SELECTED_PIN_REACH_PX,
      );
      expect(eases().at(-1)?.options.offset).toEqual([0, -255 + lowering]);
    });

    it('reserves no room for a flag the spot does not fly', async () => {
      backend = UNCONFIGURED_BACKEND;
      await create({ insets: SHEET_INSETS });
      fake.emit('load');
      select('a');
      expect(eases().at(-1)?.options.offset).toEqual([0, -255]);
    });
  });

  describe('the hover tooltip against the map’s edges', () => {
    const tooltipElement = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        '.spot-map__tooltip',
      );
    const shift = () =>
      tooltipElement()?.style.getPropertyValue('--tooltip-shift');
    const below = () =>
      tooltipElement()?.classList.contains('spot-map__tooltip--below');
    const hover = async (x: number, y: number, withPhoto = false) => {
      backend = withPhoto
        ? { ...UNCONFIGURED_BACKEND, photoBaseUrl: 'https://photos.test' }
        : UNCONFIGURED_BACKEND;
      await create();
      fake.emit('load');
      fake.projected = { x, y };
      fixture.componentRef.setInput('hoveredId', 'a');
      fixture.detectChanges();
    };

    it('stays above the pin and centred when there is room', async () => {
      await hover(500, 300);
      expect(below()).toBeFalse();
      expect(shift()).toBe('0px');
    });

    it('slides back inside the map at the left and right edges', async () => {
      // The 132 px card, padding and border included, is 66 px either side of its centre; 8 px
      // stay clear of the edge.
      await hover(20, 300);
      expect(shift()).toBe('54px');
      fixture.destroy();
      await hover(990, 300);
      expect(shift()).toBe('-64px');
    });

    it('clamps by the width the card really has on screen', async () => {
      await hover(500, 300);
      const card = tooltipElement()!.querySelector<HTMLElement>(
        '.spot-map__tooltip-card',
      )!;
      expect(card.offsetWidth).toBe(132);
    });

    it('flips below the pin when it would run off the top', async () => {
      await hover(500, 40);
      expect(below()).toBeTrue();
    });

    describe('a card that flips from above its pin to below it', () => {
      /** Every tooltip element in the page, a card still fading out among them. */
      const tooltips = () =>
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
            '.spot-map__tooltip',
          ),
        );

      /** Hovers `a` with room above its pin, then pans the pin up to the top edge. */
      async function panUnderTheTopEdge() {
        const runFrames = captureFrames();
        await hover(500, 300);
        const before = tooltipElement()!;
        expect(below()).toBeFalse();
        fake.projected = { x: 500, y: 40 };
        fake.emit('move');
        runFrames();
        fixture.detectChanges();
        return before;
      }

      it('is the same card, easing across, under normal motion', async () => {
        requestReducedMotion(false);
        const before = await panUnderTheTopEdge();
        expect(tooltips()).toEqual([before]);
        expect(below()).toBeTrue();
      });

      it('is a new card under reduced motion, which cannot slide: the old one fades out and the new one fades in', async () => {
        requestReducedMotion(true);
        const before = await panUnderTheTopEdge();
        const flipped = tooltips().filter((card) =>
          card.classList.contains('spot-map__tooltip--below'),
        );
        expect(flipped.length).toBe(1);
        expect(flipped[0]).not.toBe(before);
      });
    });

    // The backend is read once per test module, so the plate and the photo card are two specs
    // hovering the same spot 100 px from the top.
    it('keeps a name plate above a pin 100 px from the top', async () => {
      await hover(500, 100);
      expect(below()).toBeFalse();
    });

    it('flips a card with a photo below a pin 100 px from the top, where a name plate fits above', async () => {
      await hover(500, 100, true);
      expect(below()).toBeTrue();
    });
  });

  describe('the one map through the selection', () => {
    const SHEET_INSETS = { top: 0, right: 0, bottom: 510, left: 0 };
    beforeEach(() => {
      requestReducedMotion(false);
      holdAnimationFrames();
    });

    it('keeps the same map when a spot is opened, switched and closed', async () => {
      await create();
      fake.emit('load');
      select('a');
      select('b');
      select(null);
      expect(mapFactory).toHaveBeenCalledTimes(1);
      expect(fake.removed).toBeFalse();
      httpMock.expectNone('spots/vienna.geojson');
    });

    it('keeps the same map when the covered strips and the opening focus change', async () => {
      await create();
      fake.emit('load');
      fixture.componentRef.setInput('coveredInsets', SHEET_INSETS);
      fixture.componentRef.setInput('openOn', {
        center: [16.4, 48.22],
        zoom: 15,
      });
      fixture.detectChanges();
      select('a');
      expect(mapFactory).toHaveBeenCalledTimes(1);
      expect(fake.removed).toBeFalse();
    });

    it('keeps a map built on a shared spot through closing and reopening it', async () => {
      await create({
        selectedId: 'a',
        openOn: { center: [16.37, 48.2], zoom: 16 },
        insets: SHEET_INSETS,
      });
      fake.emit('load');
      select(null);
      select('b');
      expect(mapFactory).toHaveBeenCalledTimes(1);
      expect(fake.removed).toBeFalse();
    });
  });
});
