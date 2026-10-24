import { BASEMAP_SOURCE_ID } from '../terminal-map-style';

/*
 * Stand-ins for MapLibre's map and popup, and the small page fakes the spot-map specs share. Spec
 * files import this; no app code does, so the production build never compiles it.
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
   * the popups or controls (`getCanvasContainer`, maplibre-gl-dev.mjs:26893). Attached to the page
   * so a pointer released away from the map still bubbles to the window; `remove()` takes it off.
   */
  readonly canvasContainer = document.createElement('div');
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
    /** Zeroes the bearing and pitch steps, leaving the arrow-key pan and zoom (`:21529-21531`). */
    disableRotation: jasmine
      .createSpy('keyboard.disableRotation')
      .and.callFake(() => {
        this.keyboardRotatePitch = false;
      }),
    /** Never active, as MapLibre's keyboard handler never is (maplibre-gl-dev.mjs:21517). */
    isActive: () => false,
  };
  /**
   * The one-finger and mouse pan handler. MapLibre's manager treats it as active from the moment a
   * finger or button goes down — `activateOnStart` for the mouse (maplibre-gl-dev.mjs:21015,
   * `:20865`), `_active` set by the first `touchstart` for touch (`:21098`) — long before the
   * camera has moved.
   */
  readonly dragPan = { isActive: () => this.fingerDown };
  /**
   * The wheel and trackpad-pinch zoom. Active from the first wheel event until its finish timeout
   * runs out (`isActive`, maplibre-gl-dev.mjs:21606), and counted by `map.isMoving()` for as long
   * as it zooms (`:22587`, `:25356`).
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
   * catch sets `_loaded` before firing the error (maplibre-gl-dev.mjs:2877-2881), the tile
   * manager's own `error` listener flips `_sourceErrored` (`:6359-6360`), and that
   * short-circuits `TileManager.loaded()` (`:6391`), `Style.loaded()` (`:14890-14894`) and
   * `Map.isStyleLoaded()` (`:25824`) to true. Modelling that here keeps a discriminator from
   * looking right against the fake while misreading every real failure.
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
  /** Makes every pan finish at zero duration, the way any path MapLibre runs instantly would. */
  jumps = false;

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
  /**
   * Whether the camera is mid-move: a `panBy` ease or a gesture's move began, and no `moveend`
   * has ended it yet. Every `moveend` the fake emits ends it, as MapLibre clears `_moving` before
   * it fires the event (maplibre-gl-dev.mjs:23241, :23251).
   */
  private panning = false;

  /** Whether a finger or button is down on the map, so a pan handler is active. */
  private fingerDown = false;

  /** Whether a wheel or trackpad-pinch zoom is under way, so the scroll-zoom handler is active. */
  private wheelZooming = false;

  /**
   * Only the pan handler turning active, as a finger or button goes down: the instant before
   * MapLibre's manager stops the camera's ease. {@link grab} is this plus that stop; on its own it
   * is the state a re-fit meets if it runs between the two. The pointer goes down on the canvas
   * container too, which is what the component tracks independently of the handlers.
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
   * gesture handler (`resize` → `stop` → `_stopHandlers` → `HandlerManager.stop`,
   * maplibre-gl-dev.mjs:24950-24953, :23384, :24095), finger down or not. A map already moving
   * skips the stop. Then the `resize` event fires.
   */
  resize() {
    if (!this.isMoving()) {
      this.fingerDown = false;
      this.wheelZooming = false;
    }
    this.emit('resize');
  }

  /**
   * The visitor putting a finger or button down on the map, without moving it yet. MapLibre's
   * manager sees an active handler and stops the camera's ease (`handleEvent`, `:22392`), which
   * fires that ease's `moveend` synchronously: with `isMoving()` already false (`:23241`), the
   * pan handler already active, and the drag's own `movestart` still to come. The camera starts
   * moving under the finger only afterwards, once the pointer travels.
   */
  grab() {
    this.touchDown();
    if (this.panning) {
      this.emit('moveend');
    }
  }

  /**
   * The visitor turning the wheel, or pinching a trackpad, on the map. `ScrollZoomHandler._start`
   * sets `_zooming` before the manager stops the camera's ease (`:21681`, `:22392`), so the stopped
   * ease's `moveend` fires with the scroll-zoom handler active and `isMoving()` already true
   * (`:22587`): the zoom itself has no `moveend` yet.
   */
  wheel() {
    this.wheelZooming = true;
    if (this.panning) {
      this.emit('moveend');
    }
  }

  /** The wheel zoom running out: the handler goes inactive and the zoom's own `moveend` fires. */
  endWheel() {
    this.wheelZooming = false;
    this.emit('moveend');
  }

  /** The grabbed map starting to travel under the finger: a drag's camera move begins. */
  drag() {
    this.panning = true;
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

  /**
   * A move the component did not start — a drag, a fling's inertia, a wheel zoom — begins and runs
   * until the spec emits `moveend`.
   */
  startMove() {
    this.panning = true;
  }

  /**
   * Recorded like every other camera move, with the offset folded into its options. A pan that
   * starts while another is still running stops it first, and MapLibre fires the stopped ease's
   * `moveend` synchronously from inside the new `panBy` (`easeTo` → `_stop` → `_afterEase`).
   * MapLibre also zeroes the duration of an ease that is not `essential` when the visitor asks for
   * reduced motion (`easeTo`, maplibre-gl-dev.mjs:23085), and a zero-duration ease finishes, firing
   * its own `moveend`, before `panBy` returns (`_ease`, `:23387-23391`).
   */
  panBy(offset: [number, number], options: CameraMove['options']) {
    if (this.panning) {
      this.emit('moveend');
    }
    // `easeTo` stops the gestures too (`_stop(false)` → `_stopHandlers`, `:23384`): a pan the
    // component starts under a visitor's finger takes the drag away from them.
    this.fingerDown = false;
    this.wheelZooming = false;
    this.cameraMoves.push({ method: 'panBy', options: { ...options, offset } });
    this.panning = true;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (
      this.jumps ||
      options.duration === 0 ||
      (!options.essential && reducedMotion)
    ) {
      this.emit('moveend');
    }
    return this;
  }
  /** Whether the camera is mid-move, as MapLibre's `isMoving()` reports it. */
  isMoving() {
    return this.panning || this.wheelZooming;
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
    if (event === 'moveend') {
      this.panning = false;
    }
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

  /**
   * The basemap's TileJSON arriving: the source fires `data`/`metadata`
   * (maplibre-gl-dev.mjs:2871), the tile manager bubbles it carrying its `sourceId`
   * (`:15165-15169`), and the map re-fires it as `sourcedata` (`:24181`).
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
   * the source and nothing else, and the `metadata` event never happens at all — 2877-2881 is
   * the failure branch of the `:2868-2875` success branch that fires it.
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
   * tile is parsed (maplibre-gl-worker-dev.mjs:164-226). MapLibre fires it on the source with
   * the tile attached (maplibre-gl-dev.mjs:6422); other tiles are still in flight, so the style
   * is not loaded at that point.
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

/**
 * Records everything the component asks of a popup, without being one. Its container is built in
 * `addTo` the way MapLibre builds one — the class names, a `.maplibregl-popup-content` box holding
 * the content, the width cap — and laid out inside the host it is given, so the component can
 * measure it.
 */
export class FakePopup {
  lngLat?: [number, number];
  content?: HTMLElement;
  addedTo?: unknown;
  removed = false;
  /** Every width cap the component set after creating the popup. */
  readonly maxWidths: string[] = [];
  private container?: HTMLElement;

  constructor(
    readonly options: {
      anchor: string;
      closeButton: boolean;
      closeOnClick: boolean;
      maxWidth: string;
      className: string;
    },
    private readonly host: () => HTMLElement,
  ) {}

  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  getLngLat() {
    return this.lngLat;
  }
  setDOMContent(node: HTMLElement) {
    this.content = node;
    return this;
  }
  setMaxWidth(value: string) {
    this.maxWidths.push(value);
    if (this.container) {
      this.container.style.maxWidth = value;
    }
    return this;
  }
  addTo(map: unknown) {
    this.addedTo = map;
    const container = document.createElement('div');
    container.className = `maplibregl-popup maplibregl-popup-anchor-${this.options.anchor} ${this.options.className}`;
    container.style.maxWidth = this.options.maxWidth;
    const content = document.createElement('div');
    content.className = 'maplibregl-popup-content';
    if (this.content) {
      content.append(this.content);
    }
    container.append(content);
    this.host().append(container);
    this.container = container;
    return this;
  }
  getElement(): HTMLElement {
    if (!this.container) {
      throw new Error(
        'getElement() before addTo(): MapLibre has no container yet',
      );
    }
    return this.container;
  }
  /** Whether the container still waits, hidden, for the component to reveal it. */
  isPending() {
    return this.getElement().classList.contains('spot-popup-frame--pending');
  }
  /** MapLibre takes the container out of the page synchronously. */
  remove() {
    this.removed = true;
    this.container?.remove();
    return this;
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

/**
 * Replaces `ResizeObserver` with one a spec reports through by hand, recording what each
 * observer watches and whether it was disconnected.
 */
export function stubResizeObserver() {
  const created: {
    observed: Element[];
    disconnect: jasmine.Spy;
    report: () => void;
  }[] = [];
  spyOn(window, 'ResizeObserver').and.callFake(function (
    callback: ResizeObserverCallback,
  ) {
    const observed: Element[] = [];
    const observer = {
      observe: (element: Element) => observed.push(element),
      unobserve: () => {},
      disconnect: jasmine.createSpy('disconnect'),
    };
    created.push({
      observed,
      disconnect: observer.disconnect,
      report: () => callback([], observer as unknown as ResizeObserver),
    });
    return observer;
  } as never);
  return created;
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
 * Builds the control the way MapLibre injects it (`AttributionControl.onAdd`,
 * maplibre-gl-dev.mjs:23477-23480; `addControl`, `:24228`): a `details` carrying the info button,
 * open as it opens on a map of any width until the first drag, as the only child of its corner
 * inside the map's control container. The nesting matters: MapLibre's open-state rule only matches
 * a control that is the direct child of a left corner. The app adds the control with no position,
 * so it lands in `bottom-right` (`getDefaultPosition`, `:23472`).
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

/** Lets every promise chain and zero-delay task already queued run to its end. */
export function flushPending(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}
