import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CityEnum } from '../../../models/enums/map-enum';
import { MAP_FACTORY, POPUP_FACTORY } from './map-factory.token';
import { SpotMapComponent } from './spot-map.component';

/** One camera move the component asked for, trimmed to the option that decides its motion. */
interface CameraMove {
  method: string;
  options: { duration?: number };
}

/** Records everything the component asks of a map, without being one. */
class FakeMap {
  readonly handlers = new Map<string, ((e?: unknown) => void)[]>();
  readonly sources: Record<string, unknown> = {};
  readonly layers: { id: string }[] = [];
  readonly featureStates: Record<string, Record<string, unknown>> = {};
  readonly canvas = document.createElement('canvas');
  /**
   * The four handlers that can tilt or turn the map, each gated on the one call that actually
   * switches it off. MapLibre wires them as separate handlers in `_addDefaultHandlers`
   * (maplibre-gl-dev.mjs:22512-22561) and skips any reporting `isEnabled() === false`
   * (`:22363`), so turning one off leaves the other three answering gestures.
   */
  readonly dragRotate = {
    /** The mouse rotate/pitch/roll trio, and nothing touch or keyboard (`:22064-22068`). */
    disable: jasmine.createSpy('dragRotate.disable').and.callFake(() => {
      this.mouseRotatePitch = false;
    }),
  };
  readonly touchZoomRotate = {
    /** Only the two-finger twist; pinch-zoom and two-finger pitch survive (`:22188-22191`). */
    disableRotation: jasmine.createSpy('disableRotation').and.callFake(() => {
      this.twoFingerRotate = false;
    }),
  };
  readonly touchPitch = {
    /** The two-finger tilt handler has no partial off switch — pitch is all it does. */
    disable: jasmine.createSpy('touchPitch.disable').and.callFake(() => {
      this.twoFingerPitch = false;
    }),
  };
  readonly keyboard = {
    /** Zeroes the bearing and pitch steps, leaving the arrow-key pan and zoom (`:21529-21531`). */
    disableRotation: jasmine
      .createSpy('keyboard.disableRotation')
      .and.callFake(() => {
        this.keyboardRotatePitch = false;
      }),
  };
  pitch = 0;
  bearing = 0;
  private mouseRotatePitch = true;
  private twoFingerRotate = true;
  private twoFingerPitch = true;
  private keyboardRotatePitch = true;
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
  /**
   * Every camera move *the component* asked for, with the option bag it asked with, so the
   * reduced-motion spec can assert about all of them rather than about the one call site that
   * exists today. Moves MapLibre starts by itself — the keyboard ease, drag-pan inertia — never
   * reach this fake, so nothing here can speak for them. `easeTo` and `flyTo` are recorded
   * although the component calls neither today: MapLibre animates both unless the caller passes
   * `duration: 0`, so an unguarded one added later is exactly the regression that spec catches.
   */
  readonly cameraMoves: CameraMove[] = [];
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
    this.cameraMoves.push({ method: 'fitBounds', options });
  }
  easeTo(options: CameraMove['options']) {
    this.cameraMoves.push({ method: 'easeTo', options });
  }
  flyTo(options: CameraMove['options']) {
    this.cameraMoves.push({ method: 'flyTo', options });
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

  /**
   * Two fingers dragged up or down together, each moving at least 2 px: the pitch handler reads
   * that as vertical (maplibre-gl-dev.mjs:21359-21372) and returns
   * `pitchDelta = mean(travel.y) * -0.5` (`:21357`), which the manager adds to the camera's
   * pitch (`:11963`). `travel` is each finger's vertical travel in px, negative dragging up.
   */
  twoFingerVerticalDrag(travel: number) {
    if (!this.twoFingerPitch) {
      return;
    }
    this.tilt(travel * -0.5);
  }

  /** Two fingers twisted: the rotate handler's bearing delta, in degrees (`:21302-21310`). */
  twoFingerTwist(degrees: number) {
    if (!this.twoFingerRotate) {
      return;
    }
    this.bearing += degrees;
  }

  /**
   * A right-button drag, MapLibre's mouse rotate and pitch pair: `bearingDelta = travel.x * 0.8`
   * (`:21031`, rate `:23951`) and `pitchDelta = travel.y * -0.5` (`:21039`, rate `:23952`).
   */
  rightButtonDrag(travel: { x: number; y: number }) {
    if (!this.mouseRotatePitch) {
      return;
    }
    this.bearing += travel.x * 0.8;
    this.tilt(travel.y * -0.5);
  }

  /**
   * Shift with an arrow key, which the keyboard handler turns into a 15° bearing step or a 10°
   * pitch step (`:21443-21456`, `:21470-21471`, steps `:21377-21379`).
   */
  shiftArrowUp() {
    if (!this.keyboardRotatePitch) {
      return;
    }
    this.tilt(10);
  }

  /** Pitch is clamped to the map's own 0–60° range (`:9967-9968`, defaults `:23899-23900`). */
  private tilt(degrees: number) {
    this.pitch = Math.min(Math.max(this.pitch + degrees, 0), 60);
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

/**
 * Answers the media query `prefersReducedMotion()` asks — the same `window.matchMedia` fake the
 * ascii-animation-text spec drives its reduced-motion branch with. Call before `create()`: the
 * preference is read while the map draws.
 */
function requestReducedMotion(reduce: boolean) {
  spyOn(window, 'matchMedia').and.callFake(
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

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

  it('asks for no animation on the camera moves it makes when reduced motion is asked for', async () => {
    // The map's only motion concession in JS. CSS cannot reach a MapLibre camera ease, so the
    // app-wide `prefers-reduced-motion` block in styles.css does nothing for this one.
    //
    // What this covers is the option bags the component hands the map, and only those — the rest
    // of the map's motion is MapLibre's to guard, and 6.9.0 does guard most of it: `Camera`
    // zeroes its own duration when the media query matches and the move is not marked
    // `essential` (maplibre-gl-dev.mjs:23085 for `easeTo`, `:23254` for `flyTo`, reading
    // `browser.prefersReducedMotion` at `:78-83`), which covers the keyboard handler's 300 ms
    // ease on every arrow press (`:21463-21474`), drag-pan inertia (`:22789`) and `fitBounds`,
    // which routes through both (`:23023`, `:23032`). One animation stays unguarded: scroll zoom
    // smooths each wheel notch over 200 ms in its own render loop, with no reduced-motion check
    // (`:21716-21731`), and 6.9.0 offers no option for it — the handler takes zoom rates, not
    // durations (`:21584`, `:21596`) — short of `scrollZoom.disable()`, which would cost the user
    // who asked for less motion their wheel zoom. It is left open knowingly.
    requestReducedMotion(true);
    await create();
    fake.emit('load');
    expect(fake.cameraMoves.length)
      .withContext('the map framed the spots at all')
      .toBeGreaterThan(0);
    expect(fake.cameraMoves.filter((move) => move.options.duration !== 0))
      .withContext(
        'camera moves the component asked for that would still animate',
      )
      .toEqual([]);
  });

  it('eases the camera when reduced motion is not asked for', async () => {
    // The other half of the same branch: the concession is made for the users who asked for it,
    // and for nobody else. The duration itself is a tuning value, so only the ease is pinned.
    requestReducedMotion(false);
    await create();
    fake.emit('load');
    expect(fake.lastFitBounds?.duration)
      .withContext('the opening fit eases into place instead of cutting')
      .toBeGreaterThan(0);
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

  it('logs an error it paints through instead of swallowing it', async () => {
    const c = await create();
    const failed = jasmine.createSpy('failed');
    c.failed.subscribe(failed);
    fake.emit('load');
    // Attaching an `error` listener took MapLibre's own logging away: `Evented.fire` writes an
    // error to the console only while nothing listens for it (maplibre-gl-shared-dev.mjs:3149,
    // :3163). A dead glyph endpoint drops every label off a map that still paints, and without
    // this the only diagnostic left for that is the raw network tab.
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

  it('fails as unsupported on a browser whose WebGL stops at version 1', async () => {
    // maplibre-gl v6 asks for one context and one only: `Map._setupPainter()` requests `webgl2`
    // and throws `GPUInitializationError` — "WebGL2 is required to display this map" — the
    // moment it comes back null (maplibre-gl-dev.mjs:27022-27023, :20164-20167), and the `Map`
    // constructor rethrows it after cleanup (`:24123-24128`). So a browser that answers
    // `getContext('webgl')` but not `getContext('webgl2')` — iOS 14, older Android WebViews, a
    // GPU blocklist that stops at WebGL2 — cannot draw this map at all.
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
    httpMock.expectNone('spots/vienna.geojson');
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
    // `new Map(...)` throwing `GPUInitializationError` inside the async factory
    // (maplibre-gl-dev.mjs:24123-24128) even though the probe just held a WebGL2 context: the
    // context could not be created *this time* — one live context too many, a driver that
    // dropped out. The probe already turned away the browsers that can never render, so this is
    // a build that failed rather than a browser that is out, and RETRY may well get a context.
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
