import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CityEnum } from '../../../models/enums/map-enum';
import type { MapLoadEvent } from '../../../models/map/map-load-event';
import type { ElevationTiles } from './elevation';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
  POPUP_FACTORY,
} from './map-factory.token';
import { POPUP_MAX_HEIGHT_VAR } from './popup-fit';
import { LOCK_ON_AT_REST_FILTER } from './spot-layers';
import { SpotMapComponent } from './spot-map.component';
import { BASEMAP_SOURCE_ID } from './terminal-map-style';
import {
  addAttributionControl,
  buildAttributionControl,
  CameraMove,
  COLLECTION,
  FakeMap,
  FakePopup,
  flushPending,
  holdAnimationFrames,
  LOCK_ON_AT_REST,
  onlySpot,
  requestReducedMotion,
  setWidth,
  stubResizeObserver,
  tapOn,
} from './testing/fake-map';

/** Stand-in tile URLs in the shape maplibre-contour hands out. */
const ELEVATION_TILES: ElevationTiles = {
  demTiles: 'dem-shared://{z}/{x}/{y}',
  contourTiles: 'dem-contour://{z}/{x}/{y}?thresholds=11*50*100',
  demMaxzoom: 14,
};

/** The terrain layers, each with the basemap layer it belongs under (spec §3.2). */
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
 * The corner rules of maplibre-gl.css 6.9.0 that the attribution control's radius depends on,
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
  let popups: FakePopup[];
  let httpMock: HttpTestingController;
  let getContext: jasmine.Spy;
  let loseContext: jasmine.Spy;
  let mapFactory: jasmine.Spy;
  let popupFactoryRejects: boolean;
  /** While set, the fake popup factory answers only once it settles: the popup chunk still loading. */
  let popupGate: Promise<void> | undefined;
  let elevation: ElevationTiles | null;
  /** What the fake `ELEVATION_LOADER` hands back; resolves `elevation` unless a spec holds it. */
  let loadElevation: (demMaxzoom: number) => Promise<ElevationTiles | null>;

  beforeEach(async () => {
    elevation = null;
    loadElevation = () => Promise.resolve(elevation);
    fake = new FakeMap();
    popups = [];
    popupFactoryRejects = false;
    popupGate = undefined;
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
            const build = () => {
              const popup = new FakePopup(options, () => fixture.nativeElement);
              popups.push(popup);
              return popup;
            };
            return popupGate ? popupGate.then(build) : Promise.resolve(build());
          },
        },
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
  }: { city?: CityEnum; collection?: object } = {}) {
    fixture = TestBed.createComponent(SpotMapComponent);
    // A laid-out host, so the popup's fit box and the popup itself have real sizes to measure.
    fixture.nativeElement.style.cssText =
      'display:block;width:1000px;height:600px;position:relative';
    // The Karma frame is smaller than this host and earlier specs can leave content above it, so
    // the visual viewport is pinned around the host: the fit box is then the host inset by its
    // margin, whatever frame the suite runs in.
    spyOnProperty(window, 'visualViewport').and.callFake(() => {
      const host = (
        fixture.nativeElement as HTMLElement
      ).getBoundingClientRect();
      return {
        offsetLeft: host.left,
        offsetTop: host.top,
        width: host.width,
        height: host.height,
      } as VisualViewport;
    });
    fixture.componentRef.setInput('city', city);
    fixture.componentRef.setInput('retryToken', 0);
    fixture.detectChanges();
    httpMock.expectOne(`spots/${city}.geojson`).flush(collection);
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

  async function tap(id: string) {
    fake.emit('click', tapOn(id), 'spots-hit');
    await fixture.whenStable();
  }

  /**
   * Holds the popup factory — maplibre-gl's lazy chunk still on its way — until the returned
   * function is called, which lets every held popup through and waits for the component to act.
   */
  function holdPopupFactory(): () => Promise<void> {
    let letThrough!: () => void;
    popupGate = new Promise<void>((resolve) => {
      letThrough = resolve;
    });
    return () => {
      popupGate = undefined;
      letThrough();
      return flushPending();
    };
  }

  /** The pans the component asked the map for, in order. */
  function pansRequested(): CameraMove[] {
    return fake.cameraMoves.filter((move) => move.method === 'panBy');
  }

  /** Lets every animation on the popup's container finish, and the component act on that. */
  async function settleAnimations(popup: FakePopup | undefined) {
    const element = popup?.getElement();
    await Promise.all(
      (element?.getAnimations() ?? []).map((animation) =>
        animation.finished.catch(() => undefined),
      ),
    );
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
    expect(fake.layers.map((l) => l.id)).toEqual([
      'spots-hit',
      'spots-glow',
      'spots-selected-gap',
      'spots-selected',
      'spots-lock-on',
      'spots-body',
      'spots-demolished-mark',
    ]);
  });

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

  describe('the attribution control along the bottom of the map', () => {
    /** Runs the animation frame the resize asked the re-fit for. */
    function runRefitFrame() {
      const frames = window.requestAnimationFrame as jasmine.Spy;
      (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    }

    /**
     * Stands the control in at the map's bottom-right corner, `height` tall: the open bar on a
     * desktop map, or the info button on a phone. Its box is real, so the component measures it.
     */
    function placeAttribution(height: number): HTMLElement {
      const attribution = addAttributionControl(
        fixture.nativeElement.querySelector('.spot-map__canvas'),
        1000,
      );
      setAttributionHeight(attribution, height);
      return attribution;
    }

    function setAttributionHeight(attribution: HTMLElement, height: number) {
      attribution.style.cssText = `display:block;position:absolute;right:0;bottom:0;width:200px;height:${height}px`;
    }

    /** The height cap the popup was fitted to: the visible map less its margins and the tip. */
    function popupMaxHeight(): number {
      return parseFloat(
        popups[0]?.getElement().style.getPropertyValue(POPUP_MAX_HEIGHT_VAR) ??
          '',
      );
    }

    it('fits the popup to the whole frame when the control is not there', async () => {
      requestReducedMotion(false);
      await create();
      fake.emit('load');
      await tap('a');
      // 600 px frame, less a 16 px margin each side and the 10 px tip.
      expect(popupMaxHeight()).toBe(558);
    });

    it('keeps the popup above the control, which takes its strip out of the visible map', async () => {
      requestReducedMotion(false);
      await create();
      placeAttribution(78);
      fake.emit('load');
      await tap('a');
      // The 78 px strip comes off the bottom: 558 - 78.
      expect(popupMaxHeight()).toBe(480);
    });

    it('pans a pin near the bottom up until its popup and tip clear the control', async () => {
      requestReducedMotion(false);
      await create();
      placeAttribution(78);
      fake.emit('load');
      fake.projected = { x: 500, y: 540 };
      await tap('a');
      // The pin sits 34 px below the fit box's bottom edge at 506 (600 - 78 - 16).
      expect(pansRequested().length).toBe(1);
      expect(pansRequested()[0]?.options.offset).toEqual([0, 34]);
    });

    it('reserves only the info button on a phone map, where the control is collapsed', async () => {
      requestReducedMotion(false);
      await create();
      placeAttribution(29);
      fake.emit('load');
      await tap('a');
      expect(popupMaxHeight()).toBe(558 - 29);
    });

    it('re-fits the popup when the control changes size, then pans it clear of the bar', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      const observers = stubResizeObserver();
      await create();
      const attribution = placeAttribution(29);
      fake.emit('load');
      fake.projected = { x: 500, y: 540 };
      await tap('a');
      expect(pansRequested())
        .withContext('the collapsed button leaves room for the popup')
        .toEqual([]);
      const watcher = observers.find((observer) =>
        observer.observed.includes(attribution),
      );
      expect(watcher).withContext('the control is watched').toBeDefined();

      // The observer reports once when it starts watching; only a later report is a change.
      watcher?.report();
      setAttributionHeight(attribution, 78);
      watcher?.report();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
      expect(pansRequested()[0]?.options.offset).toEqual([0, 34]);
    });

    it('stops watching the control when the component is destroyed', async () => {
      const observers = stubResizeObserver();
      await create();
      const attribution = placeAttribution(29);
      fake.emit('load');
      const watcher = observers.find((observer) =>
        observer.observed.includes(attribution),
      );
      fixture.destroy();
      expect(watcher?.disconnect).toHaveBeenCalled();
    });
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
    // MapLibre applies the `bounds` option with `duration: 0` in its constructor
    // (maplibre-gl-dev.mjs:24156), so `load` paints the city already framed and nothing is left to
    // ease into view, whichever motion preference is set.
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

  it('opens one popup for the tapped pin and marks that pin selected', async () => {
    await create();
    fake.emit('load');
    await tap('a');
    expect(popups.length).toBe(1);
    expect(popups[0]?.options.maxWidth).toBe('320px');
    expect(popups[0]?.options.className).toContain('spot-popup-frame');
    expect(popups[0]?.lngLat).toEqual([16.37, 48.2]);
    expect(popups[0]?.addedTo === fake)
      .withContext('the popup was added to the live map')
      .toBe(true);
    expect(popups[0]?.content?.textContent).toContain('Alpha Bank');
    expect(fake.featureStates['a']?.['selected']).toBe(true);
  });

  it('asks MapLibre for no close button of its own', async () => {
    await create();
    fake.emit('load');
    await tap('a');
    expect(popups[0]?.options.closeButton).toBe(false);
  });

  it("closes with the animation from the popup's close button", async () => {
    await create();
    fake.emit('load');
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    await tap('a');
    const close =
      popups[0]?.content?.querySelector<HTMLElement>('.spot-popup__close');
    expect(close)
      .withContext('the popup renders its close button')
      .toBeTruthy();
    close?.click();
    expect(popups[0]?.removed)
      .withContext('still on the map while it plays its close')
      .toBe(false);
    expect(fake.featureStates['a']?.['selected'])
      .withContext('the selection drops at once')
      .toBeUndefined();
    await settleAnimations(popups[0]);
    expect(popups[0]?.removed).toBe(true);
    expect(appRef.viewCount).toBe(baseline);
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
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
    expect(fake.featureStates['b']?.['selected']).toBe(true);
    await settleAnimations(popups[0]);
    expect(popups[0]?.removed).toBe(true);
    expect(popups[1]?.removed).toBe(false);
    expect(appRef.viewCount).toBe(baseline + 1);
  });

  it("creates the popup hidden, with a fixed side and MapLibre's own closing off", async () => {
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    const options = popups[0]?.options;
    expect(options?.anchor).toBe('bottom');
    expect(options?.closeButton).toBe(false);
    expect(options?.closeOnClick).toBe(false);
    expect(options?.className).toContain('spot-popup-frame--pending');
    expect(popups[0]?.isPending())
      .withContext('hidden until the pan has settled')
      .toBe(true);
  });

  it('eases the popup width on a re-fit, but snaps it while the popup is still hidden', async () => {
    await create();
    fake.emit('load');
    await tap('a');
    const shown = getComputedStyle(popups[0]!.getElement());
    expect(popups[0]?.isPending()).toBe(false);
    expect(shown.transitionProperty).toBe('max-width');
    expect(shown.transitionDuration).toBe('0.2s');

    fake.projected = { x: 20, y: 500 };
    await tap('b');
    expect(popups[1]?.isPending()).toBe(true);
    expect(getComputedStyle(popups[1]!.getElement()).transitionProperty)
      .withContext('a hidden popup is measured at the width it is heading for')
      .toBe('none');
  });

  it('re-fits once the popup width has finished easing to a different width, so it is measured where it settled', async () => {
    holdAnimationFrames();
    await create();
    fake.emit('load');
    await tap('a');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    frames.calls.reset();
    const element = popups[0]!.getElement();
    // The ease began from the width the fit measured; it ends on another one.
    setWidth(element, element.offsetWidth + 40);
    element.dispatchEvent(
      new TransitionEvent('transitionend', {
        propertyName: 'max-height',
        bubbles: true,
      }),
    );
    expect(frames).not.toHaveBeenCalled();
    element.dispatchEvent(
      new TransitionEvent('transitionend', {
        propertyName: 'max-width',
        bubbles: true,
      }),
    );
    expect(frames).toHaveBeenCalledTimes(1);
  });

  it('does not re-fit when the width cap eased but the popup ended as wide as it was measured', async () => {
    holdAnimationFrames();
    await create();
    fake.emit('load');
    await tap('a');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    frames.calls.reset();
    popups[0]!.getElement().dispatchEvent(
      new TransitionEvent('transitionend', {
        propertyName: 'max-width',
        bubbles: true,
      }),
    );
    expect(frames).not.toHaveBeenCalled();
  });

  it('opens below a pin near the top', async () => {
    await create();
    fake.emit('load');
    fake.projected = { x: 500, y: 40 };
    await tap('a');
    expect(popups[0]?.options.anchor).toBe('top');
  });

  it('pans the popup into view, then reveals it when the camera settles', async () => {
    requestReducedMotion(false);
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    const pans = fake.cameraMoves.filter((move) => move.method === 'panBy');
    expect(pans.length).toBe(1);
    expect(pans[0]?.options.offset?.[0]).toBeLessThan(0);
    expect(pans[0]?.options.duration).toBe(300);
    expect(popups[0]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
  });

  it('reveals at once when no pan is needed', async () => {
    await create();
    fake.emit('load');
    await tap('a');
    expect(fake.cameraMoves.filter((move) => move.method === 'panBy')).toEqual(
      [],
    );
    expect(popups[0]?.isPending()).toBe(false);
  });

  it('shortens the pan under reduced motion, never to an instant jump', async () => {
    requestReducedMotion(true);
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    const pans = fake.cameraMoves.filter((move) => move.method === 'panBy');
    expect(pans.map((move) => move.options.duration)).toEqual([200]);
  });

  it('opens where the visitor left the map when they grab it mid-pan', async () => {
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    // A grab stops MapLibre's ease, which fires `moveend` with the camera wherever it stopped.
    fake.projected = { x: 90, y: 500 };
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
    expect(
      fake.cameraMoves.filter((move) => move.method === 'panBy').length,
    ).toBe(1);
  });

  it("keeps a popup tapped during another's pan hidden until its own pan settles", async () => {
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    expect(popups[0]?.isPending()).withContext('a is still panning').toBe(true);
    // b waits for a's pan to end before it is fitted, so a's pan is not interrupted by b's.
    await tap('b');
    expect(pansRequested().length)
      .withContext('b asks for no pan while a is still easing')
      .toBe(1);
    expect(popups[1]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(pansRequested().length)
      .withContext(
        "b is fitted once a's pan has settled, and needs its own pan",
      )
      .toBe(2);
    expect(popups[1]?.isPending())
      .withContext("a's pan ending does not reveal b")
      .toBe(true);
    fake.emit('moveend');
    expect(popups[1]?.isPending()).toBe(false);
  });

  it('keeps a popup tapped mid-ease hidden until the camera settles, then fits it against the settled camera', async () => {
    requestReducedMotion(false);
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    expect(pansRequested().length).toBe(1);
    // b is tapped partway along a's ease, where it sits mid-map and needs no pan of its own.
    fake.projected = { x: 500, y: 300 };
    await tap('b');
    expect(popups[1]?.isPending())
      .withContext('b is not revealed from its mid-ease position')
      .toBe(true);
    expect(pansRequested().length).toBe(1);
    // a's ease ends and has carried the map, leaving b at the left edge.
    fake.projected = { x: 20, y: 500 };
    fake.emit('moveend');
    expect(pansRequested().length)
      .withContext('b is fitted against where the map settled')
      .toBe(2);
    expect(pansRequested()[1]?.options.offset?.[0])
      .withContext('the pan brings b in from the left edge it settled at')
      .toBeLessThan(0);
    expect(popups[1]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(popups[1]?.isPending()).toBe(false);
    fake.emit('moveend');
    expect(popups[1]?.getElement().getAnimations().length)
      .withContext('revealed exactly once')
      .toBe(1);
  });

  it('waits out a drag or fling the visitor started before it fits and reveals', async () => {
    await create();
    fake.emit('load');
    fake.startMove();
    await tap('a');
    expect(popups[0]?.isPending())
      .withContext('hidden while the map is still gliding')
      .toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending())
      .withContext('fitted and revealed where the glide ended')
      .toBe(false);
    expect(pansRequested()).toEqual([]);
  });

  it('keeps waiting when the camera is moving again by the time the last move ends', async () => {
    await create();
    fake.emit('load');
    fake.startMove();
    // Registered first, so it runs before the component's own `moveend` listener: the move that
    // ends hands over to another one at once, as a fling does after a drag.
    fake.once('moveend', () => fake.startMove());
    await tap('a');
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
  });

  describe('a popup tapped while another popup is panning into view', () => {
    /** Opens `a` at the left edge, so its pan is under way, then taps `b` at the same edge. */
    async function tapBWhileAPans() {
      requestReducedMotion(false);
      await create();
      fake.emit('load');
      fake.projected = { x: 20, y: 500 };
      await tap('a');
      await tap('b');
      expect(pansRequested().length)
        .withContext("b asks for no pan while a's ease runs")
        .toBe(1);
      expect(popups[1]?.isPending()).toBe(true);
    }

    it("is fitted and panned when a's ease runs to its end, and revealed once that pan ends", async () => {
      await tapBWhileAPans();
      fake.emit('moveend');
      expect(pansRequested().length)
        .withContext('b is fitted against the settled camera and pans')
        .toBe(2);
      expect(popups[1]?.isPending())
        .withContext("a's ease ending does not reveal b")
        .toBe(true);
      fake.emit('moveend');
      expect(popups[1]?.isPending()).toBe(false);
      expect(popups[1]?.getElement().getAnimations().length)
        .withContext('revealed exactly once')
        .toBe(1);
    });

    it('is fitted but not panned when the visitor grabs the map, and opens where the map now is', async () => {
      await tapBWhileAPans();
      fake.grab();
      expect(pansRequested().length)
        .withContext(
          "the grab wins: a pan would take the drag from the visitor's finger",
        )
        .toBe(1);
      expect(popups[1]?.isPending()).toBe(false);
      expect(
        popups[1]?.getElement().style.getPropertyValue(POPUP_MAX_HEIGHT_VAR),
      )
        .withContext('fitted against the live camera all the same')
        .not.toBe('');
      fake.drag();
      fake.release();
      expect(pansRequested().length)
        .withContext('nothing pans the popup in after the drag either')
        .toBe(1);
      expect(popups[1]?.getElement().getAnimations().length)
        .withContext('revealed exactly once')
        .toBe(1);
    });

    it('is fitted but not panned when the visitor grabs the map with the wheel, even once the zoom has ended', async () => {
      await tapBWhileAPans();
      // The wheel stops a's ease with the zoom already under way, so b sees a moving camera.
      fake.wheel();
      expect(popups[1]?.isPending())
        .withContext('b keeps waiting while the zoom runs')
        .toBe(true);
      fake.endWheel();
      expect(pansRequested().length)
        .withContext(
          'the wheel grab wins even though the zoom has finished by the time b is fitted',
        )
        .toBe(1);
      expect(popups[1]?.isPending()).toBe(false);
      expect(popups[1]?.getElement().getAnimations().length)
        .withContext('revealed exactly once')
        .toBe(1);
    });

    it('is fitted and panned as usual by a tap after the visitor let go of the map', async () => {
      await tapBWhileAPans();
      fake.grab();
      fake.drag();
      fake.release();
      expect(pansRequested().length).toBe(1);
      await tap('a');
      expect(pansRequested().length)
        .withContext(
          'the newer popup pans into view now that nothing holds the map',
        )
        .toBe(2);
      expect(popups[2]?.isPending()).toBe(true);
      fake.emit('moveend');
      expect(popups[2]?.isPending()).toBe(false);
    });

    it('is fitted but not panned while a finger rests on the map when its popup is ready', async () => {
      requestReducedMotion(false);
      await create();
      fake.emit('load');
      fake.projected = { x: 20, y: 500 };
      fake.grab();
      await tap('a');
      expect(pansRequested())
        .withContext('a pan would reset the visitor’s hold on the map')
        .toEqual([]);
      expect(popups[0]?.isPending()).toBe(false);
    });
  });

  describe('a resize while the visitor holds the map', () => {
    /** Runs the animation frame the resize asked the re-fit for. */
    function runRefitFrame() {
      const frames = window.requestAnimationFrame as jasmine.Spy;
      (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    }

    /** Opens `a` at the left edge with a finger resting on the map: fitted, revealed, not panned. */
    async function openAtEdgeUnderFinger() {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create();
      fake.emit('load');
      fake.projected = { x: 20, y: 500 };
      fake.grab();
      await tap('a');
      expect(pansRequested()).toEqual([]);
      expect(popups[0]?.isPending()).toBe(false);
    }

    it('re-fits the popup without panning, and does not pan it in after the finger comes up', async () => {
      await openAtEdgeUnderFinger();
      const capsBefore = popups[0]?.maxWidths.length ?? 0;
      fake.resize();
      runRefitFrame();
      expect(popups[0]?.maxWidths.length)
        .withContext('the width cap is re-measured all the same')
        .toBeGreaterThan(capsBefore);
      expect(pansRequested())
        .withContext("a pan would take the drag from the visitor's finger")
        .toEqual([]);
      fake.drag();
      fake.release();
      expect(pansRequested())
        .withContext('the gesture won: nothing pans the popup in afterwards')
        .toEqual([]);
    });

    it('pans the popup back into view on a resize once nothing holds the map', async () => {
      await openAtEdgeUnderFinger();
      fake.release();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
      expect(pansRequested()[0]?.options.offset?.[0]).toBeLessThan(0);
    });

    it('still holds the map after the resize has reset the handlers, until the pointer comes up', async () => {
      await openAtEdgeUnderFinger();
      fake.resize();
      runRefitFrame();
      expect(pansRequested()).toEqual([]);
      fake.resize();
      runRefitFrame();
      expect(pansRequested())
        .withContext('a second resize under the same finger still pans nothing')
        .toEqual([]);
    });

    it('pans normally on a later resize once the finger has come up', async () => {
      await openAtEdgeUnderFinger();
      fake.resize();
      runRefitFrame();
      expect(pansRequested()).toEqual([]);
      fake.release();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
      expect(pansRequested()[0]?.options.offset?.[0]).toBeLessThan(0);
    });

    it('pans normally on a later resize once the browser has cancelled the touch', async () => {
      await openAtEdgeUnderFinger();
      fake.resize();
      runRefitFrame();
      fake.cancelTouch();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
    });

    it('pans normally on a later resize once the button was let go off the map', async () => {
      await openAtEdgeUnderFinger();
      fake.resize();
      runRefitFrame();
      fake.releaseOutsideMap();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
    });

    it('keeps holding the map while one of two fingers is still down', async () => {
      await openAtEdgeUnderFinger();
      // A second finger goes down and comes up; the first is still resting.
      fake.canvasContainer.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 8, bubbles: true }),
      );
      document.body.dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 8, bubbles: true }),
      );
      fake.resize();
      runRefitFrame();
      expect(pansRequested()).toEqual([]);
    });

    it('does not count a finger that went down on a control or popup rather than the map', async () => {
      await openAtEdgeUnderFinger();
      fake.release();
      popups[0]
        ?.getElement()
        .dispatchEvent(
          new PointerEvent('pointerdown', { pointerId: 9, bubbles: true }),
        );
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
    });

    it('forgets a finger left on the map of an earlier build', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create();
      fake.emit('load');
      fake.grab();
      await retry(1);
      fake.emit('load');
      fake.projected = { x: 20, y: 500 };
      await tap('a');
      expect(pansRequested().length)
        .withContext('nothing holds the rebuilt map, so the popup is panned in')
        .toBe(1);
    });

    it('stops listening for pointers once the component is destroyed', async () => {
      await create();
      const removed = spyOn(window, 'removeEventListener').and.callThrough();
      fixture.destroy();
      const types = removed.calls.allArgs().map(([type]) => type);
      expect(types).toContain('pointerup');
      expect(types).toContain('pointercancel');
    });

    it('re-fits a popup still waiting on its pan without panning, and reveals it once when that settles', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create();
      fake.emit('load');
      fake.projected = { x: 20, y: 500 };
      await tap('a');
      expect(popups[0]?.isPending())
        .withContext('a is still panning')
        .toBe(true);
      fake.touchDown();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length)
        .withContext("a re-fit pan would replace the visitor's hold on the map")
        .toBe(1);
      expect(popups[0]?.isPending())
        .withContext("still waiting on the pan's end")
        .toBe(true);
      fake.emit('moveend');
      expect(popups[0]?.isPending()).toBe(false);
      fake.emit('moveend');
      expect(popups[0]?.getElement().getAnimations().length)
        .withContext('revealed exactly once')
        .toBe(1);
    });

    it('swaps the popup to the other side without panning it, even when the drag ends before it is fitted', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      await create();
      fake.emit('load');
      fake.projected = { x: 500, y: 40 };
      fake.grab();
      await tap('a');
      expect(popups[0]?.options.anchor).toBe('top');
      // The pin ends up in the corner, off the side the popup opened on, as the drag goes on.
      fake.drag();
      fake.projected = { x: 20, y: 560 };
      fake.resize();
      runRefitFrame();
      await fixture.whenStable();
      expect(popups[1]?.options.anchor).toBe('bottom');
      expect(popups[1]?.isPending())
        .withContext('the swapped popup waits for the drag to end')
        .toBe(true);
      fake.release();
      expect(pansRequested())
        .withContext('the visitor held the map when it was swapped: no pan')
        .toEqual([]);
      expect(popups[1]?.isPending()).toBe(false);
    });
  });

  it('fits a popup against the camera as it is once maplibre-gl has loaded, not as it was at the tap', async () => {
    requestReducedMotion(false);
    await create();
    fake.emit('load');
    const letThrough = holdPopupFactory();
    fake.projected = { x: 500, y: 300 };
    fake.emit('click', tapOn('a'), 'spots-hit');
    // The visitor drags the pin into the corner while the popup's chunk is still loading.
    fake.projected = { x: 20, y: 500 };
    await letThrough();
    expect(popups[0]?.addedTo).toBeTruthy();
    expect(pansRequested().length)
      .withContext(
        'the pin is at the edge now, so the popup is panned into view',
      )
      .toBe(1);
    expect(pansRequested()[0]?.options.offset?.[0]).toBeLessThan(0);
    expect(popups[0]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
  });

  it('swaps to the other side when the camera moved the pin off the side it was created for while loading', async () => {
    requestReducedMotion(true);
    await create();
    fake.emit('load');
    const letThrough = holdPopupFactory();
    fake.projected = { x: 500, y: 40 };
    fake.emit('click', tapOn('a'), 'spots-hit');
    fake.projected = { x: 500, y: 560 };
    await letThrough();
    await flushPending();
    expect(popups[0]?.options.anchor).toBe('top');
    expect(popups.length).toBe(2);
    expect(popups[1]?.options.anchor).toBe('bottom');
    expect(popups[0]?.removed)
      .withContext('the never-shown first popup is gone at once')
      .toBe(true);
    expect(fake.featureStates['a']?.['selected'])
      .withContext('the pin stays selected through the swap')
      .toBe(true);
  });

  it('drops a popup waiting for the camera to settle when another pin is tapped, revealing only the newest', async () => {
    requestReducedMotion(false);
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    await tap('b');
    await tap('a');
    await flushPending();
    expect(popups.length).toBe(3);
    expect(popups[1]?.removed)
      .withContext('b was dropped before it was ever shown')
      .toBe(true);
    fake.emit('moveend');
    expect(popups[1]?.getElement().getAnimations().length)
      .withContext('b is never revealed')
      .toBe(0);
    expect(pansRequested().length)
      .withContext("the newest popup is fitted once, after a's ease")
      .toBe(2);
    fake.emit('moveend');
    expect(popups[2]?.isPending()).toBe(false);
    expect(popups[2]?.getElement().getAnimations().length).toBe(1);
  });

  it('leaves a popup waiting for the camera to settle unfitted and unrevealed once its pin is deselected', async () => {
    await create();
    fake.emit('load');
    fake.startMove();
    await tap('a');
    fake.renderedPins = [];
    fake.emit('click', { point: { x: 1, y: 1 } });
    await flushPending();
    fake.emit('moveend');
    expect(popups[0]?.getElement().getAnimations().length).toBe(0);
    expect(pansRequested()).toEqual([]);
    expect(popups[0]?.removed).toBe(true);
  });

  it('never fits or reveals a popup that was waiting for the camera when the map is torn down', async () => {
    requestReducedMotion(false);
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    await tap('b');
    const waiting = popups[1];
    fixture.destroy();
    fake.emit('moveend');
    expect(waiting?.removed).toBe(true);
    expect(waiting?.getElement().getAnimations().length).toBe(0);
    expect(pansRequested().length)
      .withContext('no pan after the teardown')
      .toBe(1);
    expect(TestBed.inject(ApplicationRef).viewCount).toBe(0);
  });

  it('reveals a pending popup once, when a resize re-fit pan that interrupted its pan settles', async () => {
    holdAnimationFrames();
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    expect(popups[0]?.isPending()).withContext('a is still panning').toBe(true);
    fake.emit('resize');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    expect(fake.cameraMoves.filter((move) => move.method === 'panBy').length)
      .withContext('the re-fit pans the popup back into view')
      .toBe(2);
    expect(popups[0]?.isPending())
      .withContext("the re-fit pan's interruption does not reveal a")
      .toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending())
      .withContext('revealed when the re-fit pan settles')
      .toBe(false);
    fake.emit('moveend');
    expect(popups[0]?.getElement().getAnimations().length)
      .withContext('revealed exactly once')
      .toBe(1);
  });

  it('eases an edge pan under reduced motion and reveals the popup when it settles', async () => {
    requestReducedMotion(true);
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    const pans = fake.cameraMoves.filter((move) => move.method === 'panBy');
    expect(pans.map((move) => move.options.duration)).toEqual([200]);
    expect(pans[0]?.options.essential)
      .withContext('MapLibre would otherwise jump instead of easing')
      .toBe(true);
    expect(popups[0]?.isPending())
      .withContext('hidden while the shortened pan runs')
      .toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
  });

  it('reveals the popup once when its pan ends before panBy returns', async () => {
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    // Any zero-duration path: the pan finishes, firing its `moveend`, inside `panBy`.
    fake.jumps = true;
    await tap('a');
    expect(popups[0]?.isPending())
      .withContext('revealed although its moveend has already fired')
      .toBe(false);
    fake.emit('moveend');
    expect(popups[0]?.getElement().getAnimations().length)
      .withContext('revealed exactly once')
      .toBe(1);
  });

  it('reveals a pending popup once when a resize re-fit pan ends before panBy returns', async () => {
    holdAnimationFrames();
    await create();
    fake.emit('load');
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    expect(popups[0]?.isPending()).withContext('a is still panning').toBe(true);
    // Any zero-duration path: the pan finishes, firing its `moveend`, inside `panBy`.
    fake.jumps = true;
    fake.emit('resize');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    expect(fake.cameraMoves.filter((move) => move.method === 'panBy').length)
      .withContext('the re-fit pans the popup back into view')
      .toBe(2);
    expect(popups[0]?.isPending())
      .withContext('revealed although the re-fit pan has already ended')
      .toBe(false);
    fake.emit('moveend');
    expect(popups[0]?.getElement().getAnimations().length)
      .withContext('revealed exactly once')
      .toBe(1);
  });

  it('caps a tall popup and tells it to scroll', async () => {
    const notes = 'A long ledge along the canal, waxed every summer. '.repeat(
      40,
    );
    await create({
      collection: {
        type: 'FeatureCollection',
        features: [
          {
            ...COLLECTION.features[0],
            properties: { ...COLLECTION.features[0]?.properties, notes },
          },
        ],
      },
    });
    fixture.nativeElement.style.height = '150px';
    fake.emit('load');
    fake.projected = { x: 500, y: 75 };
    await tap('a');
    const element = popups[0]?.getElement();
    expect(element?.style.getPropertyValue('--spot-popup-max-height')).toMatch(
      /^\d+(\.\d+)?px$/,
    );
    expect(popups[0]?.content?.querySelector('.spot-popup__body--more'))
      .withContext('the capped body says more is below')
      .toBeTruthy();
  });

  it('closes on a map click that misses every pin, not on one that hits a pin', async () => {
    await create();
    fake.emit('load');
    await tap('a');
    fake.renderedPins = [{}];
    fake.emit('click', { point: { x: 1, y: 1 } });
    expect(fake.featureStates['a']?.['selected'])
      .withContext("a click on a pin is that pin's to handle")
      .toBe(true);
    fake.renderedPins = [];
    fake.emit('click', { point: { x: 1, y: 1 } });
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
    await settleAnimations(popups[0]);
    expect(popups[0]?.removed).toBe(true);
  });

  it("starts the old popup's close at once when another pin is tapped", async () => {
    await create();
    fake.emit('load');
    await tap('a');
    expect(popups[0]?.isPending()).withContext('a was revealed').toBe(false);
    await tap('b');
    expect(popups[1]).withContext('b exists').toBeDefined();
    expect(popups[0]?.removed).toBe(false);
    expect(
      popups[0]
        ?.getElement()
        .getAnimations()
        .some((animation) => animation.playState === 'running'),
    )
      .withContext('a is already playing its close')
      .toBe(true);
  });

  it('removes every popup at once on teardown, a failure or a city switch', async () => {
    await create();
    fake.emit('load');
    await tap('a');
    popups[0]?.content
      ?.querySelector<HTMLElement>('.spot-popup__close')
      ?.click();
    await tap('b');
    expect(popups[0]?.removed).withContext('a is still closing').toBe(false);
    fake = new FakeMap();
    fixture.componentRef.setInput('retryToken', 1);
    fixture.detectChanges();
    expect(popups.map((popup) => popup.removed)).toEqual([true, true]);
    httpMock.expectOne('spots/vienna.geojson').flush(COLLECTION);
    await fixture.whenStable();
  });

  it('re-fits once per frame however many resizes arrive', async () => {
    holdAnimationFrames();
    await create();
    fake.emit('load');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    frames.calls.reset();
    fake.emit('resize');
    fake.emit('resize');
    fake.emit('resize');
    expect(frames).toHaveBeenCalledTimes(1);
  });

  it('swaps the popup to the other side when its side runs out of room on a resize', async () => {
    requestReducedMotion(true);
    holdAnimationFrames();
    await create();
    fake.emit('load');
    fake.projected = { x: 500, y: 40 };
    await tap('a');
    expect(popups[0]?.options.anchor).toBe('top');
    fake.projected = { x: 500, y: 560 };
    fake.emit('resize');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    await fixture.whenStable();
    expect(popups[0]?.removed)
      .withContext('a is closing, not gone')
      .toBe(false);
    expect(popups[0]?.getElement().getAnimations().length)
      .withContext('a is playing its close')
      .toBeGreaterThan(0);
    expect(popups.length).toBe(2);
    expect(popups[1]?.options.anchor).toBe('bottom');
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

  it('pulses a lock-on onto the pin it selects', async () => {
    requestReducedMotion(false);
    holdAnimationFrames();
    await create();
    fake.emit('load');
    await tap('a');
    expect(fake.lastLockOnFilter())
      .withContext('the ring is on the tapped pin alone')
      .toEqual(onlySpot('a'));
    expect(fake.lastLockOnPaint('circle-radius'))
      .withContext('the ring starts wide of the pin')
      .toBe(34);
    expect(fake.lastLockOnPaint('circle-stroke-opacity')).toBe(1);
  });

  it('starts a fresh lock-on when the selection moves to another pin', async () => {
    requestReducedMotion(false);
    const cancelFrame = holdAnimationFrames();
    await create();
    fake.emit('load');
    await tap('a');
    const before = fake.paintCalls.length;
    await tap('b');
    const moved = fake.paintCalls
      .slice(before)
      .filter((call) => call.layer === 'spots-lock-on');
    expect(cancelFrame)
      .withContext('the first pulse was stopped')
      .toHaveBeenCalled();
    expect(moved.map((call) => call.value))
      .withContext('the first pulse was put to rest before the second began')
      .toContain(LOCK_ON_AT_REST);
    expect(fake.lastLockOnPaint('circle-radius')).toBe(34);
    expect(fake.lastLockOnFilter())
      .withContext('the ring moved to the newly tapped pin')
      .toEqual(onlySpot('b'));
  });

  it('stops the lock-on when the popup closes', async () => {
    requestReducedMotion(false);
    const cancelFrame = holdAnimationFrames();
    await create();
    fake.emit('load');
    await tap('a');
    popups[0]?.content
      ?.querySelector<HTMLElement>('.spot-popup__close')
      ?.click();
    expect(cancelFrame).toHaveBeenCalled();
    expect(fake.lastLockOnPaint('circle-radius')).toBe(11.5);
    expect(fake.lastLockOnPaint('circle-stroke-opacity')).toEqual(
      LOCK_ON_AT_REST,
    );
    expect(fake.lastLockOnFilter())
      .withContext('the resting ring matches no pin')
      .toBe(LOCK_ON_AT_REST_FILTER);
  });

  it('stops the lock-on before the map is torn down', async () => {
    requestReducedMotion(false);
    const cancelFrame = holdAnimationFrames();
    await create();
    fake.emit('load');
    await tap('a');
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

  it('skips the lock-on under reduced motion, keeping the ring', async () => {
    requestReducedMotion(true);
    holdAnimationFrames();
    await create();
    fake.emit('load');
    await tap('a');
    // The paint record is the witness, not `requestAnimationFrame`: Angular's change-detection
    // scheduler asks for frames of its own on every tap. lock-on-pulse.spec.ts pins the pulse
    // itself asking for none.
    expect(
      fake.paintCalls.filter((call) => call.layer === 'spots-lock-on'),
    ).toEqual([]);
    expect(fake.filterCalls).toEqual([]);
    expect(fake.featureStates['a']?.['selected']).toBe(true);
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
});
