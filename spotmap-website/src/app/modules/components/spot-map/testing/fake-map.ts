import { BASEMAP_SOURCE_ID } from '../terminal-map-style';

/*
 * Stand-ins for MapLibre's map and the small page fakes the spot-map specs share. Spec
 * files import this; no app code does, so the production build never compiles it.
 *
 * MapLibre internals named in this file were read in maplibre-gl 6.15.0.
 */

/** One camera move the component asked for, trimmed to the option that decides its motion. */
export interface CameraMove {
  method: string;
  options: {
    duration?: number;
    essential?: boolean;
    offset?: [number, number];
  };
}

/** Records everything the component asks of a map, without being one. */
export class FakeMap {
  readonly handlers = new Map<string, ((e?: unknown) => void)[]>();
  readonly sources: Record<string, unknown> = {};
  readonly layers: { id: string }[] = [];
  /**
   * Every `addLayer` call, with the layer it was asked to go beneath — `undefined` for a layer
   * added on top of everything, as the pins are.
   */
  readonly addedLayers: { id: string; beforeId?: string }[] = [];
  readonly featureStates: Record<string, Record<string, unknown>> = {};
  readonly canvas = document.createElement('canvas');
  /**
   * MapLibre's canvas container, which its handlers listen on and which holds the canvas but not
   * the controls (`getCanvasContainer`). Attached to the page so a pointer released away
   * from the map still bubbles to the window; `remove()` takes it off.
   */
  readonly canvasContainer = document.createElement('div');
  /**
   * The four handlers that can tilt or turn the map, each gated on the one call that actually
   * switches it off. MapLibre wires them as separate handlers in
   * `HandlerManager._addDefaultHandlers`, and `handleEvent` skips any reporting
   * `isEnabled() === false`, so turning one off leaves the other three answering gestures.
   */
  readonly dragRotate = {
    /**
     * The mouse rotate/pitch/roll trio, and nothing touch or keyboard
     * (`DragRotateHandler.disable`).
     */
    disable: jasmine.createSpy('dragRotate.disable').and.callFake(() => {
      this.mouseRotatePitch = false;
    }),
  };
  readonly touchZoomRotate = {
    /**
     * Only the two-finger twist; pinch-zoom and two-finger pitch survive
     * (`TwoFingersTouchZoomRotateHandler.disableRotation`).
     */
    disableRotation: jasmine.createSpy('disableRotation').and.callFake(() => {
      this.twoFingerRotate = false;
    }),
    /** Whether a pinch is under way; the specs never pinch, only drag. */
    isActive: () => false,
  };
  readonly touchPitch = {
    /** The two-finger tilt handler has no partial off switch — pitch is all it does. */
    disable: jasmine.createSpy('touchPitch.disable').and.callFake(() => {
      this.twoFingerPitch = false;
    }),
  };
  readonly keyboard = {
    /**
     * Zeroes the bearing and pitch steps, leaving the arrow-key pan and zoom
     * (`KeyboardHandler.disableRotation`).
     */
    disableRotation: jasmine
      .createSpy('keyboard.disableRotation')
      .and.callFake(() => {
        this.keyboardRotatePitch = false;
      }),
    /**
     * Never active, as MapLibre's keyboard handler never is (`KeyboardHandler.isActive` returns a
     * flag nothing sets).
     */
    isActive: () => false,
  };
  /**
   * The one-finger and mouse pan handler. MapLibre's manager treats it as active from the moment a
   * finger or button goes down — `activateOnStart` for the mouse (`generateMousePanHandler`,
   * `DragHandler.dragStart`), `_active` set by the first `touchstart` for touch
   * (`TouchPanHandler._calculateTransform`) — long before the camera has moved.
   */
  readonly dragPan = { isActive: () => this.fingerDown };
  /**
   * The wheel and trackpad-pinch zoom. Active from the first wheel event until its finish timeout
   * runs out (`ScrollZoomHandler.isActive`), and counted by `map.isMoving()` for as long as it
   * zooms (`Map.isMoving` → `HandlerManager.isMoving` → `HandlerManager.isZooming`).
   */
  readonly scrollZoom = { isActive: () => this.wheelZooming };
  /** The shift-drag box and double-click zooms, which the specs never drive. */
  readonly boxZoom = { isActive: () => false };
  readonly doubleClickZoom = { isActive: () => false };
  pitch = 0;
  bearing = 0;
  private mouseRotatePitch = true;
  private twoFingerRotate = true;
  private twoFingerPitch = true;
  private keyboardRotatePitch = true;
  /**
   * Drives `isStyleLoaded()`, and is flipped to `true` by `failBasemapSource()` on purpose:
   * MapLibre reports the style loaded the instant a source errors. `VectorTileSource.load()`'s
   * catch sets `_loaded` before firing the error, the tile manager's own `error` listener flips
   * `_sourceErrored`, and that short-circuits `TileManager.loaded()`, `Style.loaded()` and
   * `Map.isStyleLoaded()` to true. Modelling that here keeps a discriminator from looking right
   * against the fake while misreading every real failure.
   */
  styleLoaded = false;
  removed = false;
  /** The sources whose data MapLibre would report loaded; `drawPins()` adds the spots. */
  readonly loadedSources = new Set<string>();
  /**
   * Every camera move *the component* asked for, with the option bag it asked with, so the
   * reduced-motion spec can assert about all of them rather than about the one call site that
   * exists today. Moves MapLibre starts by itself — the keyboard ease, drag-pan inertia — never
   * reach this fake, so nothing here can speak for them. `easeTo` and `flyTo` are recorded
   * although the component calls neither today: MapLibre animates both unless the caller passes
   * `duration: 0`, so an unguarded one added later is exactly the regression that spec catches.
   */
  readonly cameraMoves: CameraMove[] = [];
  /** The style the component handed the factory. */
  style?: { sources: Record<string, unknown> };
  /** Where `project()` puts every spot on screen; a spec moves it to place the tapped pin. */
  projected = { x: 500, y: 300 };
  /** What `queryRenderedFeatures()` finds under a map click: a pin, or nothing. */
  renderedPins: unknown[] = [];

  constructor() {
    this.canvasContainer.append(this.canvas);
    document.body.append(this.canvasContainer);
  }

  project() {
    return this.projected;
  }

  getCanvasContainer() {
    return this.canvasContainer;
  }
  /** Whether a finger or button is down on the map, so a pan handler is active. */
  private fingerDown = false;

  /** Whether a wheel or trackpad-pinch zoom is under way, so the scroll-zoom handler is active. */
  private wheelZooming = false;

  /**
   * Only the pan handler turning active, as a finger or button goes down: the instant before
   * MapLibre's manager stops the camera's ease. The pointer goes down on the canvas container too, which is what the component tracks independently of the handlers.
   */
  touchDown() {
    this.fingerDown = true;
    this.firePointer('pointerdown', this.canvasContainer);
  }

  /** One pointer event for the single pointer the specs ever press, bubbling as the real ones do. */
  private firePointer(type: string, target: EventTarget) {
    target.dispatchEvent(
      new PointerEvent(type, { pointerId: 7, bubbles: true }),
    );
  }

  /**
   * MapLibre's `Map.resize()`: an idle map stops its camera first, and that stop resets every
   * gesture handler (`Map.resize` → `Map.stop` → `Camera.stop` → `Camera._stopHandlers` →
   * `HandlerManager.stop`), finger down or not. A map already moving skips the stop. Then the
   * `resize` event fires.
   */
  resize() {
    if (!this.isMoving()) {
      this.fingerDown = false;
      this.wheelZooming = false;
    }
    this.emit('resize');
  }

  /**
   * The visitor turning the wheel, or pinching a trackpad, on the map. `ScrollZoomHandler._start`
   * sets `_zooming` before the manager stops the camera's ease (`HandlerManager.handleEvent`), so
   * the stopped ease's `moveend` fires with the scroll-zoom handler active and `isMoving()`
   * already true (`HandlerManager.isZooming`): the zoom itself has no `moveend` yet.
   */
  wheel() {
    this.wheelZooming = true;
  }

  /** The wheel zoom running out: the handler goes inactive and the zoom's own `moveend` fires. */
  endWheel() {
    this.wheelZooming = false;
    this.emit('moveend');
  }

  /** The finger or button coming up on the map: the pan handler resets and the drag's move ends. */
  release() {
    this.fingerDown = false;
    this.firePointer('pointerup', this.canvasContainer);
    this.emit('moveend');
  }

  /**
   * The button coming up after the pointer was dragged off the map: the pointer event lands on
   * whatever is under it, never on the canvas container.
   */
  releaseOutsideMap() {
    this.fingerDown = false;
    this.firePointer('pointerup', document.body);
    this.emit('moveend');
  }

  /** The browser taking the touch over, for a scroll or a system gesture: `pointercancel`, no `pointerup`. */
  cancelTouch() {
    this.fingerDown = false;
    this.firePointer('pointercancel', this.canvasContainer);
  }

  /** Whether the camera is mid-move, as MapLibre's `isMoving()` reports it. */
  isMoving() {
    return this.wheelZooming;
  }
  queryRenderedFeatures() {
    return this.renderedPins;
  }
  /** A handler that removes itself after its first call, as MapLibre's `once` does. */
  once(event: string, fn: (e?: unknown) => void) {
    const wrapper = (e?: unknown) => {
      this.off(event, wrapper);
      fn(e);
    };
    return this.on(event, wrapper);
  }

  on(event: string, layerOrFn: unknown, maybeFn?: unknown) {
    const layer = typeof layerOrFn === 'string' ? layerOrFn : undefined;
    const fn = (
      typeof layerOrFn === 'function' ? layerOrFn : maybeFn
    ) as () => void;
    const key = this.key(event, layer);
    this.handlers.set(key, [...(this.handlers.get(key) ?? []), fn]);
    return this;
  }
  off(event: string, fn: unknown) {
    const handlers = this.handlers.get(event) ?? [];
    this.handlers.set(
      event,
      handlers.filter((handler) => handler !== fn),
    );
    return this;
  }
  emit(event: string, payload?: unknown, layer?: string) {
    for (const fn of this.handlers.get(this.key(event, layer)) ?? []) {
      fn(payload);
    }
  }
  isSourceLoaded(id: string) {
    return this.loadedSources.has(id);
  }
  /** The spot source finishing and the next frame painting it: what ends DRAW. */
  drawPins() {
    this.loadedSources.add('spots');
    this.emit('render');
  }
  private key(event: string, layer?: string) {
    return layer ? `${event}:${layer}` : event;
  }
  addSource(id: string, source: unknown) {
    this.sources[id] = source;
  }
  addLayer(layer: { id: string }, beforeId?: string) {
    this.layers.push(layer);
    this.addedLayers.push({ id: layer.id, beforeId });
  }
  /** The terrain layers the component added, in the order it added them. */
  terrainLayers() {
    return this.addedLayers.filter((added) => !added.id.startsWith('spots-'));
  }
  fitBounds(
    _bounds: [[number, number], [number, number]],
    options: CameraMove['options'],
  ) {
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
    this.canvasContainer.remove();
  }
  /**
   * Every paint property the component set on the live map, in order — the lock-on pulse's
   * frames among them.
   */
  readonly paintCalls: { layer: string; property: string; value: unknown }[] =
    [];
  /**
   * Every paint property the component set after `remove()`, kept apart from `paintCalls`: a
   * removed MapLibre map has no style left to paint, so none of these would ever reach the screen.
   */
  readonly paintCallsAfterRemoval: {
    layer: string;
    property: string;
    value: unknown;
  }[] = [];
  setPaintProperty(layer: string, property: string, value: unknown) {
    (this.removed ? this.paintCallsAfterRemoval : this.paintCalls).push({
      layer,
      property,
      value,
    });
    return this;
  }
  /** The last value the component set for one of the lock-on ring's properties. */
  lastLockOnPaint(property: string): unknown {
    return [...this.paintCalls]
      .reverse()
      .find(
        (call) => call.layer === 'spots-lock-on' && call.property === property,
      )?.value;
  }
  /** Every layer filter the component set on the live map, in order. */
  readonly filterCalls: { layer: string; filter: unknown }[] = [];
  /** Every layer filter set after `remove()`, kept apart for the same reason as paint calls. */
  readonly filterCallsAfterRemoval: { layer: string; filter: unknown }[] = [];
  setFilter(layer: string, filter: unknown) {
    (this.removed ? this.filterCallsAfterRemoval : this.filterCalls).push({
      layer,
      filter,
    });
    return this;
  }
  /** The last filter the component set on the lock-on ring. */
  lastLockOnFilter(): unknown {
    return [...this.filterCalls]
      .reverse()
      .find((call) => call.layer === 'spots-lock-on')?.filter;
  }

  /**
   * Two fingers dragged up or down together, each moving at least 2 px: the pitch handler reads
   * that as vertical (`TwoFingersTouchPitchHandler.gestureBeginsVertically`) and returns
   * `pitchDelta = mean(travel.y) * -0.5` (`_move`), which the camera helper adds to the camera's
   * pitch (`handleMapControlsRollPitchBearingZoom`). `travel` is each finger's vertical travel
   * in px, negative dragging up.
   */
  twoFingerVerticalDrag(travel: number) {
    if (!this.twoFingerPitch) {
      return;
    }
    this.tilt(travel * -0.5);
  }

  /**
   * Two fingers twisted: the rotate handler's bearing delta, in degrees
   * (`TwoFingersTouchRotateHandler._move`).
   */
  twoFingerTwist(degrees: number) {
    if (!this.twoFingerRotate) {
      return;
    }
    this.bearing += degrees;
  }

  /**
   * A right-button drag, MapLibre's mouse rotate and pitch pair: `bearingDelta = travel.x * 0.8`
   * (`generateMouseRotationHandler`, default `rotateSpeed`) and `pitchDelta = travel.y * -0.5`
   * (`generateMousePitchHandler`, default `pitchSpeed`). The bearing is the linear form only: by
   * default `dragRotate` moves circularly, flipping the sign above the map's centre and turning to
   * the angle around the centre more than 100 px above or below it. The specs only check that a
   * disabled handler moves nothing, so the linear form is enough.
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
   * pitch step (`KeyboardHandler.keydown`, default `bearingStep` and `pitchStep`).
   */
  shiftArrowUp() {
    if (!this.keyboardRotatePitch) {
      return;
    }
    this.tilt(10);
  }

  /**
   * Pitch is clamped to the map's own 0–60° range (`TransformHelper.setPitch` clamps to
   * `minPitch`/`maxPitch`, which default to 0 and 60).
   */
  private tilt(degrees: number) {
    this.pitch = Math.min(Math.max(this.pitch + degrees, 0), 60);
  }

  /**
   * The basemap's TileJSON arriving: the source fires `data`/`metadata` (`VectorTileSource.load`),
   * the tile manager bubbles it carrying its `sourceId` (the evented-parent data `Style` gives
   * it), and the map re-fires it as `sourcedata` (the `Map` constructor's `data` listener).
   */
  loadBasemapMetadata() {
    this.emit('sourcedata', {
      sourceId: BASEMAP_SOURCE_ID,
      sourceDataType: 'metadata',
      isSourceLoaded: true,
    });
  }

  /**
   * The basemap never coming up. The TileJSON request failed, so the catch fires an error naming
   * the source and nothing else, and the `metadata` event never happens at all —
   * `VectorTileSource.load`'s catch is the failure branch of the success branch that fires it.
   */
  failBasemapSource() {
    this.styleLoaded = true;
    this.emit('error', {
      error: new Error('Failed to fetch https://tiles.openfreemap.org/planet'),
      sourceId: BASEMAP_SOURCE_ID,
    });
  }

  /**
   * A terrain source never coming up: the same error shape as a dead basemap — no tile, no
   * metadata ever — naming its own source.
   */
  failTerrainSource(sourceId: 'dem' | 'contours') {
    this.emit('error', {
      error: new Error(`Failed to load the ${sourceId} tiles`),
      sourceId,
    });
  }

  /**
   * One resource of a live basemap failing: a vector tile, or a glyph range fetched while that
   * tile is parsed (`WorkerTile.parse` asks the main thread for its glyphs and waits for them).
   * MapLibre fires it on the source with the tile attached (`TileManager._loadTile`'s catch);
   * other tiles are still in flight, so the style is not loaded at that point.
   */
  failOneResource() {
    this.emit('error', {
      error: new Error('one tile failed to load'),
      sourceId: BASEMAP_SOURCE_ID,
      tile: { tileID: { key: '14/8936/5681' } },
    });
  }

  /**
   * A style-level error the map paints through: `Source layer … does not exist` is fired on the
   * style itself (`Style._validateLayer`), so it names no source at all.
   */
  failStyleValidation() {
    this.emit('error', {
      error: new Error(
        'Source layer "water" does not exist on source "openmaptiles"',
      ),
    });
  }
}

/** Two spots, one active and one demolished, each with one photo: the feed most specs load. */
export const COLLECTION = {
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
 * preference is read while the map draws. A second call within one spec changes the answer.
 */
export function requestReducedMotion(reduce: boolean): void {
  const matchMedia: jasmine.Spy<typeof window.matchMedia> = jasmine.isSpy(
    window.matchMedia,
  )
    ? (window.matchMedia as jasmine.Spy<typeof window.matchMedia>)
    : spyOn(window, 'matchMedia');
  matchMedia.and.callFake(
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

/**
 * Holds every animation frame the component asks for, so the lock-on pulse stays on the frame
 * it paints synchronously and a spec can read it without racing the real clock.
 */
export function holdAnimationFrames(): jasmine.Spy {
  spyOn(window, 'requestAnimationFrame').and.returnValue(1);
  return spyOn(window, 'cancelAnimationFrame');
}

/** The lock-on's resting stroke opacity: nothing. */
export const LOCK_ON_AT_REST = 0;

/** The lock-on filter that picks out the one spot with this id. */
export const onlySpot = (id: string) => ['==', ['get', 'id'], id];

/** The shape MapLibre hands a layer click handler, trimmed to what the component reads. */
export function tapOn(id: string) {
  return { features: [{ id, properties: { id } }] };
}

/** Gives the element a layout width, which jsdom-free Karma would otherwise measure for real. */
export function setWidth(host: HTMLElement, width: number): void {
  Object.defineProperty(host, 'offsetWidth', {
    configurable: true,
    value: width,
  });
}

/** The corners MapLibre stacks its controls in that the attribution can sit in. */
export type ControlCorner = 'bottom-right' | 'bottom-left';

/**
 * Builds the control the way MapLibre injects it (`AttributionControl.onAdd`, `Map.addControl`):
 * a `details` carrying the info button, open as it opens on a map of any width until the first
 * drag, as the only child of its corner inside the map's control container. The nesting matters:
 * MapLibre's open-state rule only matches a control that is the direct child of a left corner.
 * The app adds the control with no position, so it lands in `bottom-right`
 * (`AttributionControl.getDefaultPosition`).
 */
export function buildAttributionControl(corner: ControlCorner): HTMLElement {
  const container = document.createElement('div');
  container.className = 'maplibregl-control-container';
  const cornerElement = document.createElement('div');
  cornerElement.className = `maplibregl-ctrl-${corner}`;
  const control = document.createElement('details');
  control.className =
    'maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show';
  const button = document.createElement('summary');
  button.className = 'maplibregl-ctrl-attrib-button';
  control.append(button);
  cornerElement.append(control);
  container.append(cornerElement);
  return container;
}

/**
 * Stands in for the control MapLibre injects into the canvas host, open. The host's width is what
 * the component reads to tell a phone from a desktop.
 */
export function addAttributionControl(
  host: HTMLElement,
  width: number,
  corner: ControlCorner = 'bottom-right',
): HTMLElement {
  setWidth(host, width);
  const container = buildAttributionControl(corner);
  host.append(container);
  return container.querySelector<HTMLElement>('.maplibregl-ctrl-attrib')!;
}
