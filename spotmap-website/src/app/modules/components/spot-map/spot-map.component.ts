import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  createComponent,
  DestroyRef,
  effect,
  ElementRef,
  EnvironmentInjector,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import type {
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapMouseEvent,
  Popup as MapLibrePopup,
} from 'maplibre-gl';
import { filter, lastValueFrom, Subject, takeUntil, tap } from 'rxjs';
import { CityEnum, MapFailureReason } from '../../../models/enums/map-enum';
import { SpotCollection, SpotFeature } from '../../../models/spots/spot';
import {
  SpotsLoaded,
  SpotsLoadEvent,
  SpotsService,
} from '../../../services/spots.service';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import {
  SPOT_POPUP_FRAME_CLASS,
  SpotPopupComponent,
} from '../spot-popup/spot-popup.component';
import { demMaxzoomFor, type ElevationTiles } from './elevation';
import type { MapLoadEvent } from '../map-container/map-load-progress';
import { framingBounds } from './fit-bounds';
import { startLockOn } from './lock-on-pulse';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
  POPUP_FACTORY,
} from './map-factory.token';
import {
  type Box,
  fitBoxWithin,
  fitPopup,
  GALLERY_HEIGHT_VAR,
  type PopupAnchor,
  type PopupFit,
  popupFrame,
  POPUP_FIT_MARGIN_PX,
  POPUP_MAX_HEIGHT_VAR,
  type ScreenPoint,
} from './popup-fit';
import { dismissPopup, POPUP_PENDING_CLASS, revealPopup } from './popup-motion';
import { SPOT_HIT_LAYER_ID, SPOT_LAYERS, SPOT_SOURCE_ID } from './spot-layers';
import {
  BASEMAP_SOURCE_ID,
  buildElevationAdditions,
  buildTerminalStyle,
} from './terminal-map-style';

/** Padding, in pixels, around the fitted spot bounds. */
const FIT_PADDING_PX = 48;

/** Never zoom past this when fitting a tight cluster — a 20-metre-wide view helps nobody. */
const FIT_MAX_ZOOM = 16;

/**
 * A map this wide or narrower has its attribution collapsed to the info button — once it has
 * painted, and again whenever it narrows to this width. The figure is this component's own
 * choice, matching the width MapLibre switches its compact layout on at when `compact` is left
 * unset. On a phone the expanded credits, which run to fourteen lines, would cover half the map.
 */
const NARROW_MAP_MAX_WIDTH_PX = 640;

/** How long the pan that brings an opening popup into view takes. */
const PAN_DURATION_MS = 300;

/** Reduced motion shortens the pan, never to an instant jump: a cut would lose the visitor's place. */
const PAN_REDUCED_DURATION_MS = 200;

/** The pan's ease: fast off the mark, settling gently onto the framed popup. */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** A popup on screen or about to rise: MapLibre's popup, the component in it, its spot and side. */
interface OpenPopup {
  readonly popup: MapLibrePopup;
  readonly ref: ComponentRef<SpotPopupComponent>;
  readonly spot: SpotFeature;
  readonly anchor: PopupAnchor;
  /**
   * Whether the fit has been applied. A popup added while the camera is still moving is not
   * fitted until it settles, and until then a resize has nothing to re-fit.
   */
  fitted: boolean;
  /**
   * The popup's width as the last fit measured it. A width-cap ease starts from the width the fit
   * saw, so a `transitionend` that finds the same width has nothing new to re-measure.
   */
  fittedWidth: number;
}

/**
 * The MapLibre handlers a visitor moves the map through. Each reports itself active from the
 * moment a finger or button goes down or the wheel starts, before the camera has moved.
 *
 * The keyboard handler is left out: it never reports itself active (`KeyboardHandler.isActive`
 * returns a flag nothing sets, maplibre-gl-dev.mjs:21517), so an arrow key cannot be told from
 * no input. Its ease replaces a pan this component has just started instead, which loses nothing:
 * the popup is revealed when the key's ease ends.
 */
const GESTURE_HANDLERS = [
  'dragPan',
  'touchZoomRotate',
  'scrollZoom',
  'doubleClickZoom',
  'boxZoom',
] as const;

/**
 * Whether a MapLibre gesture handler is active. MapLibre stops a running ease the instant a
 * gesture handler turns active (`HandlerManager.handleEvent`, maplibre-gl-dev.mjs:22392) - firing
 * that ease's `moveend` synchronously, with `isMoving()` already false and no `movestart` of the
 * gesture yet - so this is the only way to tell that `moveend` from an ease running to its end.
 *
 * It is not enough to know a finger is down: `Map.resize()` on an idle map stops the camera, which
 * resets every handler (`:24950-24953`, `:23384`, `:24095`) while the finger stays where it is.
 * {@link SpotMapComponent} therefore pairs this with the pointers it tracks itself.
 */
function isGestureActive(map: MapLibreMap): boolean {
  return GESTURE_HANDLERS.some((name) => map[name].isActive());
}

/**
 * Whether a MapLibre `error` means a source the style cannot do without never came up — the one
 * failure this map can never paint through. Both fields are read off the payload, since neither
 * is declared on maplibre-gl's public `ErrorEvent`:
 *
 * - `sourceId` is attached to every event bubbling out of a source's tile manager
 *   (maplibre-gl-dev.mjs:15165-15169), so an error fired on the style itself — `Source layer …
 *   does not exist` at `:14888` — carries none, and a map that can still paint is left alone.
 * - `tile` is attached only when a single tile failed (`:6422`; a 404 fires nothing at all,
 *   `:6423`). A glyph range is fetched while a tile is parsed, so it arrives the same way.
 * - a source that did come up fired `data`/`metadata` first (`:2871`) — the success branch the
 *   failing path at `:2877-2881` skips — so a source still awaiting metadata never loaded.
 *
 * `map.isStyleLoaded()` is no use here: it already reports `true` by the time a source error
 * reaches this handler, because the tile manager's own `error` listener (`:6359-6360`)
 * short-circuits `TileManager.loaded()` (`:6391`) and with it `Style.loaded()` (`:14890-14894`).
 */
function namesAnUnusableSource(
  event: unknown,
  sourcesAwaitingMetadata: ReadonlySet<string>,
): boolean {
  const { sourceId, tile } = event as { sourceId?: string; tile?: unknown };
  return (
    sourceId !== undefined &&
    tile === undefined &&
    sourcesAwaitingMetadata.has(sourceId)
  );
}

/**
 * Draws a city's spots on a MapLibre map, and owns opening, fitting and closing the popup of the
 * tapped spot: fitted into the visible map, panned into view and animated in and out. The container
 * owns the loading and failure chrome.
 */
@Component({
  selector: 'app-spot-map',
  imports: [],
  templateUrl: './spot-map.component.html',
  styleUrl: './spot-map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotMapComponent {
  /** The city whose spots are drawn; any change rebuilds the map on that city. */
  city = input.required<CityEnum>();

  /** Bumped by the container on RETRY; any change rebuilds the map from scratch. */
  retryToken = input.required<number>();

  /** The pins are on the painted map — the end of DRAW. */
  ready = output<void>();
  /** The map can never paint this build; the container shows its failure chrome for the reason. */
  failed = output<MapFailureReason>();
  /**
   * Every real loading milestone of the current build, for the loader's progress; DRAW's
   * completion is `ready`.
   */
  loadEvent = output<MapLoadEvent>();

  private readonly canvasHost =
    viewChild.required<ElementRef<HTMLDivElement>>('canvasHost');
  private readonly spots = inject(SpotsService);
  private readonly mapFactory = inject(MAP_FACTORY);
  private readonly popupFactory = inject(POPUP_FACTORY);
  private readonly loadElevation = inject(ELEVATION_LOADER);
  private readonly environment = inject(EnvironmentInjector);
  private readonly applicationRef = inject(ApplicationRef);

  private map?: MapLibreMap;

  /**
   * Whether the map was last measured at or under {@link NARROW_MAP_MAX_WIDTH_PX}, so a resize
   * collapses the attribution on the way down to a phone width and never again while the visitor
   * has it open there.
   */
  private mapIsNarrow = false;

  /**
   * Latched the moment the map either paints or gives up, so one map can never report both
   * `ready` and `failed`. Every teardown resets it, because the next build is a new map.
   */
  private outcome: 'pending' | 'painted' | 'failed' = 'pending';

  /** The popup that belongs to the selection, if any — one spot at a time. */
  private open?: OpenPopup;
  /** Popups playing their close animation; teardown removes them at once. */
  private readonly closing = new Set<OpenPopup>();
  /** The newest tap's component while its popup chunk loads; a later tap supersedes it. */
  private pendingRef?: ComponentRef<SpotPopupComponent>;
  /** The animation frame a coalesced resize re-fit waits on. */
  private refitFrame?: number;
  /**
   * The pointers currently down on the map's canvas container, by pointer id. Kept apart from
   * MapLibre's gesture handlers, which a resize resets under a resting finger: this is the fact
   * that a visitor holds the map, and it ends only when the pointer does.
   */
  private readonly heldPointers = new Set<number>();
  /** Removes the pointer listeners of the current map; set while a map is attached. */
  private stopTrackingPointers?: () => void;
  /** Disconnects the observer on the attribution control; set while a painted map is attached. */
  private stopWatchingAttribution?: () => void;
  /**
   * The `moveend` listener that may fit or reveal the pending popup. Only the newest one acts, so
   * a pan that interrupts the one a popup waits on can take over its reveal, and a superseded or
   * torn-down popup never acts.
   */
  private armedReveal?: () => void;
  /** The selected pin's spot id, whose `selected` feature state is set. */
  private selectedId?: string;
  /**
   * Stops the selected pin's lock-on pulse and puts its ring to rest; set while a pin is
   * selected.
   */
  private cancelLockOn?: () => void;

  /**
   * Bumped by every teardown. A build whose await resolves against a stale generation lost its
   * race with a city switch, a retry, or destruction, and throws its map away instead of
   * attaching it.
   */
  private generation = 0;

  /** Fires on every teardown, ending the spots request of the build it replaces. */
  private readonly superseded = new Subject<void>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.teardown());

    // The container reuses this instance across city selections and retries, so both inputs
    // re-arm the renderer: drop the old map (releasing its WebGL context) and rebuild.
    effect(() => {
      const city = this.city();
      this.retryToken();
      untracked(() => {
        this.teardown();
        void this.build(city);
      });
    });
  }

  private async build(city: CityEnum): Promise<void> {
    const generation = this.generation;

    // Probed before anything is fetched: a browser without WebGL can never draw this map,
    // and the container withholds RETRY for `unsupported`.
    if (!this.hasWebGl()) {
      this.fail('unsupported', generation);
      return;
    }

    // Elevation is decoration, so nothing waits on it. This call only warms the loader: it starts
    // the terrain library imports alongside the spot fetch and the map's own chunk, and its result
    // is ignored. The result that counts comes from a second call after `load`, so the loader's
    // timeout bounds how long after `load` relief may still be added rather than how long after
    // the build began — a phone whose map paints late would otherwise lose relief the library
    // already had ready. The loader memoises its setup, so that second call reuses these imports.
    const demMaxzoom = demMaxzoomFor(city);
    void this.loadElevation(demMaxzoom);

    let collection: SpotCollection;
    try {
      const loaded = await lastValueFrom(
        this.spots.loadSpots(city).pipe(
          tap((event) => this.reportSpots(event, generation)),
          filter((event): event is SpotsLoaded => event.type === 'done'),
          // A city switch or retry has no use for this request any more: ending it frees the
          // connection and the live query's deadline timer instead of leaving them to run out.
          takeUntil(this.superseded),
        ),
      );
      collection = loaded.collection;
    } catch {
      this.fail('unreachable', generation);
      return;
    }
    if (generation !== this.generation) {
      return;
    }

    // A city whose spot set is still empty has nothing to frame: with no bounds the map would
    // open on the null island (lng 0, lat 0, zoom 0) with no sign that anything is missing, so
    // the container's failure chrome — which already offers RETRY — is the honest outcome.
    if (collection.features.length === 0) {
      this.fail('unreachable', generation);
      return;
    }

    // The map is built already framed on the city: MapLibre applies `bounds` in its constructor
    // with no animation (maplibre-gl-dev.mjs:24156), so its first paint is the framed city and
    // no opening camera move follows it.
    const bounds = framingBounds(
      collection.features.map((feature) => feature.geometry.coordinates),
    );

    const style = buildTerminalStyle();
    // The basemap owes the map its metadata — the TileJSON — before anything can be drawn from
    // it, and it is the one source the map cannot paint without. A DEM or contour source that
    // never comes up costs the relief, not the map: its error is logged and nothing more.
    const sourcesAwaitingMetadata = new Set([BASEMAP_SOURCE_ID]);

    let map: MapLibreMap;
    try {
      map = await this.mapFactory({
        container: this.canvasHost().nativeElement,
        style,
        bounds: bounds ?? undefined,
        fitBoundsOptions: { padding: FIT_PADDING_PX, maxZoom: FIT_MAX_ZOOM },
        // Attribution is a licence condition of the OSM-derived tiles, never optional.
        attributionControl: { compact: true },
      });
    } catch (error) {
      // Either maplibre-gl's lazy chunk never arrived — after a redeploy a client holding a
      // cached index.html asks for a hashed chunk that is gone — or the `Map` constructor threw
      // because the GPU would not give it a context the probe just held. Both are a build that
      // failed rather than a browser that can never render, so RETRY is worth offering. Saying
      // so here is the only way it gets said at all: `build()` is launched with `void`, so an
      // escaping rejection leaves the container on its spinner until the watchdog gives up.
      // Logging it is the other half of that: catching the rejection is what took the browser's
      // own unhandled-rejection report away, and no map exists to fire the `error` event that
      // reports every other failure below, so without this the console never names what went
      // missing — a chunk load, or the GPU refusing a context.
      console.error(error);
      this.fail('unreachable', generation);
      return;
    }
    if (generation !== this.generation) {
      map.remove();
      return;
    }
    this.map = map;
    this.trackPointers(map);
    this.reportLoad({ kind: 'renderer-ready' }, generation);

    // A style passed as an object is loaded a frame after construction
    // (maplibre-gl-dev.mjs:14802-14809), so this listener still hears it.
    map.on('style.load', () => {
      this.reportLoad({ kind: 'style-loaded' }, generation);
    });

    // Rotation and pitch are off: the map stays flat and north-up whatever the gesture. Four
    // handlers can move those two degrees of freedom and each needs its own switch — MapLibre
    // wires them separately (maplibre-gl-dev.mjs:22512-22561) and skips only the ones reporting
    // `isEnabled() === false` (`:22363`). `dragRotate.disable()` reaches the mouse trio alone
    // (`:22064-22068`) and `touchZoomRotate.disableRotation()` the two-finger twist alone
    // (`:22188-22191`), which leaves the two-finger tilt and Shift+Arrow live by default
    // (`:23927-23930`). Keyboard pan and zoom stay: `disableRotation()` zeroes only the bearing
    // and pitch steps (`:21529-21531`), and arrow keys are the only pointer-free way to move.
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    map.keyboard.disableRotation();

    // Basemap tiles only, and only until the paint: relief tiles must never hold the reveal. A
    // tile request fires `sourcedataloading` with its tile only on a cache miss, a loaded tile
    // `sourcedata` with its tile, and an aborted one `sourcedataabort`; a 404 fires nothing
    // (maplibre-gl-dev.mjs:6776, :6501, :6431, :6422-6423).
    let tilesRequested = 0;
    let tilesLoaded = 0;
    const countsAsBasemapTile = (event: { sourceId: string; tile?: unknown }) =>
      this.outcome === 'pending' &&
      event.sourceId === BASEMAP_SOURCE_ID &&
      event.tile !== undefined;
    const reportTiles = () =>
      this.reportLoad(
        { kind: 'tiles', loaded: tilesLoaded, requested: tilesRequested },
        generation,
      );

    map.on('sourcedataloading', (event) => {
      if (countsAsBasemapTile(event)) {
        tilesRequested += 1;
        reportTiles();
      }
    });

    map.on('sourcedataabort', (event) => {
      if (countsAsBasemapTile(event)) {
        tilesRequested = Math.max(0, tilesRequested - 1);
        reportTiles();
      }
    });

    map.on('sourcedata', (event) => {
      // No generation guard on the metadata: the set belongs to this build, and only this build's
      // own error handler reads it.
      if (event.sourceDataType === 'metadata') {
        sourcesAwaitingMetadata.delete(event.sourceId);
      }
      if (countsAsBasemapTile(event)) {
        tilesLoaded += 1;
        reportTiles();
      }
    });

    map.on('error', (event) => {
      // MapLibre fires one `error` for everything from a dead basemap to a single 404'd glyph
      // range, so what the payload names is what separates a map that will never draw from one
      // that paints fine without that resource. The generation guard keeps a late error from a
      // torn-down map off the build that replaced it.
      if (generation !== this.generation) {
        return;
      }
      // Attaching this listener took MapLibre's own logging away: `Evented.fire` writes an
      // error to the console only while nothing listens for it
      // (maplibre-gl-shared-dev.mjs:3149, :3163). Both outcomes below need it back — a fatal
      // one shows the user four words, and a map that paints on without its glyphs shows
      // nothing at all.
      console.error(event.error);
      if (namesAnUnusableSource(event, sourcesAwaitingMetadata)) {
        this.fail('unreachable', generation);
      }
    });

    map.on('load', () => {
      if (generation !== this.generation || this.outcome !== 'pending') {
        return;
      }
      this.outcome = 'painted';
      this.reportLoad({ kind: 'painted' }, generation);
      this.drawSpots(map, collection);
      // The pins are drawn on the first frame rendered once their source has loaded. MapLibre's
      // `idle` would also wait for every DEM tile, and relief must never hold the reveal.
      const pinsDrawn = () => {
        if (generation !== this.generation || this.map !== map) {
          map.off('render', pinsDrawn);
          return;
        }
        if (!map.isSourceLoaded(SPOT_SOURCE_ID)) {
          return;
        }
        map.off('render', pinsDrawn);
        this.ready.emit();
      };
      map.on('render', pinsDrawn);
      this.mapIsNarrow = this.isNarrow();
      this.collapseAttributionOnNarrowMap(this.mapIsNarrow);
      this.watchAttributionSize(map, generation);
      // Only now: `load` waits on every visible source's tiles, so terrain in the opening style
      // would hold the pins back behind the slowest DEM tile.
      // A missing terrain library resolves `null` — the loader never rejects — and leaves the map
      // flat.
      void this.addElevation(map, this.loadElevation(demMaxzoom), generation);
    });

    // A phone turned from landscape to portrait narrows a map that opened wide, and MapLibre
    // only re-collapses its compact attribution on a drag, so the narrowing is caught here.
    map.on('resize', () => {
      if (generation !== this.generation || this.outcome !== 'painted') {
        return;
      }
      const narrow = this.isNarrow();
      this.collapseAttributionOnNarrowMap(narrow && !this.mapIsNarrow);
      this.mapIsNarrow = narrow;
      this.scheduleRefit(map, generation);
    });

    map.on('click', SPOT_HIT_LAYER_ID, (event: MapLayerMouseEvent) => {
      void this.openPopup(map, collection, event, generation);
    });

    // MapLibre's own close-on-click is off because it removes the popup at once; this closes it
    // with the animation instead.
    map.on('click', (event: MapMouseEvent) => {
      if (generation !== this.generation || this.open === undefined) {
        return;
      }
      // A pin's own click handler is taking this one: switching, not closing.
      if (
        map.queryRenderedFeatures(event.point, { layers: [SPOT_HIT_LAYER_ID] })
          .length > 0
      ) {
        return;
      }
      this.closePopup();
    });

    // A pointer over a pin should say it can be tapped; the hit layer is the 22 px thumb target.
    map.on('mouseenter', SPOT_HIT_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', SPOT_HIT_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });
  }

  /**
   * Opens one popup for the tapped pin, carrying a {@link SpotPopupComponent}. The open popup
   * starts its close first, so a tap while another popup is open replaces it instead of leaving a
   * second component alive on the map. MapLibre builds no close button: the component draws its own
   * and asks through `closeRequested`.
   */
  private openPopup(
    map: MapLibreMap,
    collection: SpotCollection,
    event: MapLayerMouseEvent,
    generation: number,
  ): void {
    // The rendered feature only carries the id; the loaded collection is where the typed spot —
    // photo list included — actually lives.
    const tappedId = event.features?.[0]?.id;
    const spot = collection.features.find(
      (feature) => feature.properties.id === String(tappedId),
    );
    if (!spot) {
      return;
    }

    this.closePopup();
    const id = spot.properties.id;
    map.setFeatureState({ source: SPOT_SOURCE_ID, id }, { selected: true });
    this.selectedId = id;
    this.cancelLockOn = startLockOn(map, id, {
      reducedMotion: prefersReducedMotion(),
    });

    const ref = this.createContent(spot);
    this.pendingRef = ref;
    void this.showPopup(map, spot, ref, generation);
  }

  /** Builds the popup's component for `spot`, attached and rendered, wired to close its popup. */
  private createContent(spot: SpotFeature): ComponentRef<SpotPopupComponent> {
    const ref = createComponent(SpotPopupComponent, {
      environmentInjector: this.environment,
    });
    ref.setInput('spot', spot);
    // The popup draws its own close button; the subscription ends with the component.
    ref.instance.closeRequested.subscribe(() => {
      if (this.open?.ref === ref) {
        this.closePopup();
      }
    });
    // Built outside any template, so its view has to be attached by hand: without that nothing
    // would ever re-render the gallery's photo after an arrow is pressed.
    this.applicationRef.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    return ref;
  }

  /**
   * Creates the popup for `ref` hidden, adds it to the map and fits it once the camera holds still.
   * The side and width cap it is created with come from where the pin is now; the fit itself is
   * done against the camera as it is when the popup is ready, because the map may move while
   * maplibre-gl loads. A tap or a teardown that overtook it while loading throws it away.
   */
  private async showPopup(
    map: MapLibreMap,
    spot: SpotFeature,
    ref: ComponentRef<SpotPopupComponent>,
    generation: number,
    visitorHeldMap = false,
  ): Promise<void> {
    const frame = popupFrame(
      this.fitBox(),
      map.project(spot.geometry.coordinates),
    );

    let popup: MapLibrePopup;
    try {
      popup = await this.popupFactory({
        anchor: frame.anchor,
        closeButton: false,
        closeOnClick: false,
        maxWidth: `${frame.maxWidth}px`,
        className: `${SPOT_POPUP_FRAME_CLASS} ${POPUP_PENDING_CLASS}`,
      });
    } catch {
      // The popup's maplibre-gl chunk never arrived. Left alone this would show an amber pin
      // with nothing beside it, so the tap is unwound: the view released, the pin dropped.
      if (this.pendingRef === ref) {
        this.pendingRef = undefined;
        this.deselect();
      }
      destroyRef(ref);
      return;
    }
    if (generation !== this.generation || this.pendingRef !== ref) {
      popup.remove();
      destroyRef(ref);
      return;
    }

    this.pendingRef = undefined;
    popup
      .setLngLat(spot.geometry.coordinates)
      .setDOMContent(ref.location.nativeElement)
      .addTo(map);
    const open: OpenPopup = {
      popup,
      ref,
      spot,
      anchor: frame.anchor,
      fitted: false,
      fittedWidth: 0,
    };
    this.open = open;
    // The width cap eases on a re-fit and the next fit must measure where it settled, not partway.
    // An ease that ends on the width the fit measured, because the content was narrower than both
    // caps, has nothing to re-measure.
    popup.getElement().addEventListener('transitionend', (event) => {
      if (
        event.propertyName === 'max-width' &&
        this.open === open &&
        popup.getElement().offsetWidth !== open.fittedWidth
      ) {
        this.scheduleRefit(map, generation);
      }
    });
    this.fitWhenSettled(map, open, visitorHeldMap);
  }

  /**
   * Fits and reveals `open` once the camera holds still. A camera still moving — the pan of a
   * popup opened a moment ago, a drag, a fling, a zoom — is about to leave the position the pin
   * has now, so the popup waits hidden for the move's `moveend` and is fitted against the camera
   * that is left. Whatever moves the camera again before then is waited out the same way.
   *
   * A visitor with hold of the map wins: the popup is fitted and revealed where the map is, never
   * panned. That is also what a grab during the wait looks like - it stops the ease being waited
   * on, which fires its `moveend` before the drag has moved the camera - and a pan then would take
   * the drag away from the visitor's finger. A wheel grab is seen the same way, but its zoom keeps
   * the camera moving, so the wait goes on past it; `visitorHeldMap` carries what an earlier check
   * saw into the fit that finally runs, once the gesture has let go.
   */
  private fitWhenSettled(
    map: MapLibreMap,
    open: OpenPopup,
    visitorHeldMap = false,
  ): void {
    this.armedReveal = undefined;
    const held = visitorHeldMap || this.isHeld(map);
    if (!map.isMoving()) {
      const fit = this.fitToCamera(map, open, held);
      if (fit) {
        this.panThenReveal(map, open, held ? [0, 0] : fit.panBy);
      }
      return;
    }
    const onSettle = () => {
      if (this.armedReveal !== onSettle) {
        return;
      }
      this.armedReveal = undefined;
      if (this.open === open) {
        this.fitWhenSettled(map, open, held);
      }
    };
    this.armedReveal = onSettle;
    map.once('moveend', onSettle);
  }

  /**
   * Fits `open` against the camera as it is now: the width cap, then the measured fit. Returns
   * the fit, or `undefined` when its side ran out of room and it was swapped for a fresh popup on
   * the other side (MapLibre has no public anchor setter), which fits itself the same way and
   * inherits `visitorHeldMap`.
   */
  private fitToCamera(
    map: MapLibreMap,
    open: OpenPopup,
    visitorHeldMap = false,
  ): PopupFit | undefined {
    const box = this.fitBox();
    const pin = map.project(open.spot.geometry.coordinates);
    open.popup.setMaxWidth(`${popupFrame(box, pin).maxWidth}px`);
    const fit = this.applyFit(open, box, pin, open.anchor);
    open.fitted = true;
    if (fit.anchor === open.anchor) {
      return fit;
    }
    this.closePopup({ keepSelection: true });
    const ref = this.createContent(open.spot);
    this.pendingRef = ref;
    void this.showPopup(map, open.spot, ref, this.generation, visitorHeldMap);
    return undefined;
  }

  /**
   * Measures the popup as it laid out and applies the fit: the height cap and the gallery's
   * height go on the container as CSS variables, and the component learns whether its body
   * scrolls. On a re-fit `keepAnchor` holds the side the popup opened on while it still has room.
   */
  private applyFit(
    open: OpenPopup,
    box: Box,
    pin: ScreenPoint,
    keepAnchor?: PopupAnchor,
  ): PopupFit {
    const { gallery, body } = open.ref.instance.naturalHeights();
    const element = open.popup.getElement();
    open.fittedWidth = element.offsetWidth;
    const content = element.querySelector<HTMLElement>(
      '.maplibregl-popup-content',
    );
    // The frame's padding and border sit around the component, inside the capped content box.
    const chrome =
      (content?.offsetHeight ?? 0) -
      (open.ref.location.nativeElement as HTMLElement).offsetHeight;
    const fit = fitPopup({
      box,
      pin,
      width: open.fittedWidth,
      naturalGalleryHeight: gallery,
      naturalBodyHeight: body + chrome,
      keepAnchor,
    });
    element.style.setProperty(POPUP_MAX_HEIGHT_VAR, `${fit.maxHeight}px`);
    if (gallery > 0) {
      element.style.setProperty(GALLERY_HEIGHT_VAR, `${fit.galleryHeight}px`);
    }
    open.ref.setInput('scrolls', fit.scrolls);
    open.ref.changeDetectorRef.detectChanges();
    return fit;
  }

  /**
   * Reveals the popup once it is in view: at once when it already is, otherwise after the pan
   * settles. A visitor grabbing the map stops the ease, which fires `moveend` too, so the popup
   * opens where the map now is and is not panned again.
   */
  private panThenReveal(
    map: MapLibreMap,
    open: OpenPopup,
    panBy: [number, number],
  ): void {
    if (panBy[0] === 0 && panBy[1] === 0) {
      this.reveal(open);
      return;
    }
    this.panRevealing(map, open, panBy);
  }

  /**
   * Pans by `panBy` and reveals `open` when that pan settles. The listener is armed only after the
   * pan has started: a `panBy` that stops a still-running ease fires that ease's `moveend`
   * synchronously, and that one must not reveal `open`. A pan that has already ended by the time
   * `panBy` returns fired its own `moveend` too, so the popup is revealed at once instead.
   */
  private panRevealing(
    map: MapLibreMap,
    open: OpenPopup,
    panBy: [number, number],
  ): void {
    this.armedReveal = undefined;
    this.pan(map, panBy);
    if (map.isMoving()) {
      this.revealOnSettle(map, open);
    } else {
      this.reveal(open);
    }
  }

  /** Reveals `open` on the next `moveend`, unless a newer pan has taken the reveal over. */
  private revealOnSettle(map: MapLibreMap, open: OpenPopup): void {
    const reveal = () => {
      if (this.armedReveal === reveal) {
        this.armedReveal = undefined;
        this.reveal(open);
      }
    };
    this.armedReveal = reveal;
    map.once('moveend', reveal);
  }

  /** Shows `open` with its animation, if it is still the open popup and not shown yet. */
  private reveal(open: OpenPopup): void {
    if (this.open === open && isPending(open)) {
      revealPopup(open.popup.getElement(), prefersReducedMotion());
    }
  }

  /**
   * Eases the camera by `panBy`, shortened under reduced motion. `essential` because MapLibre
   * otherwise turns every ease into an instant jump under reduced motion, and the shortened ease
   * here already is the reduced-motion version.
   */
  private pan(map: MapLibreMap, panBy: [number, number]): void {
    map.panBy(panBy, {
      duration: prefersReducedMotion()
        ? PAN_REDUCED_DURATION_MS
        : PAN_DURATION_MS,
      easing: easeOutCubic,
      essential: true,
    });
  }

  /**
   * Closes the open popup with its animation and removes it once that has played. The pin's
   * selection and lock-on drop at once, unless `keepSelection` — a popup swapping sides keeps its
   * pin selected.
   */
  private closePopup({ keepSelection = false } = {}): void {
    const open = this.open;
    this.open = undefined;
    if (!keepSelection) {
      this.deselect();
    }
    if (!open) {
      return;
    }
    this.closing.add(open);
    void dismissPopup(open.popup.getElement(), prefersReducedMotion()).then(
      () => this.discard(open),
    );
  }

  /**
   * Removes a popup from the map and destroys the component inside it. One popup is created per
   * pin tap, so anything left behind here leaks on every tap (QC6).
   */
  private discard(open: OpenPopup): void {
    this.closing.delete(open);
    open.popup.remove();
    destroyRef(open.ref);
  }

  /**
   * Removes every popup — open, closing or still loading — at once, without animating, and drops
   * the selection. The canvas host is reused across builds, so a popup left playing its close would
   * sit on the next city's map.
   */
  private removePopupsNow(): void {
    const open = this.open;
    this.open = undefined;
    if (open) {
      this.discard(open);
    }
    for (const closing of [...this.closing]) {
      this.discard(closing);
    }
    if (this.pendingRef) {
      destroyRef(this.pendingRef);
      this.pendingRef = undefined;
    }
    this.armedReveal = undefined;
    this.deselect();
    if (this.refitFrame !== undefined) {
      cancelAnimationFrame(this.refitFrame);
      this.refitFrame = undefined;
    }
  }

  /** Stops the lock-on pulse and drops the selected pin's feature state. */
  private deselect(): void {
    this.cancelLockOn?.();
    this.cancelLockOn = undefined;

    const id = this.selectedId;
    this.selectedId = undefined;
    if (id !== undefined) {
      this.map?.removeFeatureState({ source: SPOT_SOURCE_ID, id }, 'selected');
    }
  }

  /** Re-fits the open popup on the next animation frame, once however many resizes arrive. */
  private scheduleRefit(map: MapLibreMap, generation: number): void {
    if (this.refitFrame !== undefined) {
      return;
    }
    this.refitFrame = requestAnimationFrame(() => {
      this.refitFrame = undefined;
      if (generation === this.generation) {
        this.refit(map);
      }
    });
  }

  /**
   * Fits the open popup to the resized map. On the same side its caps change and the map pans any
   * part pushed out back into view; when that side ran out of room the popup is swapped for one on
   * the other side, the old one fading out as the new one rises. A popup still waiting for the
   * camera to settle is fitted then, against the resized map.
   *
   * A visitor with hold of the map wins here too: the caps and the side are re-fitted, but nothing
   * pans, since a pan would take the drag from their finger. The popup is not panned in once they
   * let go either; a pending popup still reveals when the pan it waits on ends.
   */
  private refit(map: MapLibreMap): void {
    const open = this.open;
    if (!open?.fitted) {
      return;
    }
    const held = this.isHeld(map);
    const fit = this.fitToCamera(map, open, held);
    if (!held && fit && (fit.panBy[0] !== 0 || fit.panBy[1] !== 0)) {
      // This pan stops the one a pending popup waits on, so its reveal moves to this pan's end.
      if (isPending(open)) {
        this.panRevealing(map, open, fit.panBy);
      } else {
        this.pan(map, fit.panBy);
      }
    }
  }

  /**
   * The box a popup must fit in, in canvas-host pixels: the map frame intersected with the visual
   * viewport, so a frame scrolled partly off screen or under a phone's on-screen keyboard counts
   * only its visible part, less the strip along the bottom the attribution control occupies.
   */
  private fitBox(): Box {
    const visual = window.visualViewport;
    const viewport: Box = visual
      ? {
          left: visual.offsetLeft,
          top: visual.offsetTop,
          right: visual.offsetLeft + visual.width,
          bottom: visual.offsetTop + visual.height,
        }
      : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const host = this.canvasHost().nativeElement.getBoundingClientRect();
    return fitBoxWithin(
      host,
      viewport,
      POPUP_FIT_MARGIN_PX,
      this.attributionStripHeight(host),
    );
  }

  /**
   * How much of the map's bottom edge the attribution control covers, measured as it is laid out
   * now: the open credits bar on a wide map, the info button on a narrow one, nothing when the
   * control is absent or hidden. It is a licence condition and stays where it is, so popups are
   * fitted around it instead.
   */
  private attributionStripHeight(host: DOMRect): number {
    const attribution = this.attributionControl()?.getBoundingClientRect();
    if (!attribution || attribution.width === 0 || attribution.height === 0) {
      return 0;
    }
    return Math.max(0, host.bottom - attribution.top);
  }

  /** MapLibre's attribution control inside the canvas host, if it is there. */
  private attributionControl(): HTMLElement | null {
    return this.canvasHost().nativeElement.querySelector<HTMLElement>(
      '.maplibregl-ctrl-attrib',
    );
  }

  /**
   * Whether the visitor has hold of the map: a pointer is down on it, or a MapLibre gesture
   * handler is active. The pointer alone would miss a wheel zoom and the handler alone a resize,
   * which resets the handlers under a finger that has not moved.
   */
  private isHeld(map: MapLibreMap): boolean {
    return this.heldPointers.size > 0 || isGestureActive(map);
  }

  /**
   * Tracks the pointers down on `map`'s canvas container until the component lets the map go. Their
   * ends are heard on the window, in the capture phase: a mouse button let go away from the map
   * ends on whatever is under it, and a touch the browser takes over for a scroll ends in
   * `pointercancel`. A context menu or a lost window focus may swallow the end altogether, so
   * both let go of every pointer rather than leave the map held for good.
   */
  private trackPointers(map: MapLibreMap): void {
    const container = map.getCanvasContainer();
    const down = (event: PointerEvent) =>
      this.heldPointers.add(event.pointerId);
    const up = (event: PointerEvent) =>
      this.heldPointers.delete(event.pointerId);
    const releaseAll = () => this.heldPointers.clear();
    container.addEventListener('pointerdown', down);
    container.addEventListener('contextmenu', releaseAll);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', releaseAll);
    this.stopTrackingPointers = () => {
      container.removeEventListener('pointerdown', down);
      container.removeEventListener('contextmenu', releaseAll);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', releaseAll);
      this.heldPointers.clear();
    };
  }

  /**
   * Re-fits the open popup whenever the attribution control changes size - expanded, collapsed, or
   * collapsed again by a narrowing - since its strip is part of the fit. The observer reports once
   * as it starts watching, which is no change and is skipped.
   */
  private watchAttributionSize(map: MapLibreMap, generation: number): void {
    const attribution = this.attributionControl();
    if (!attribution) {
      return;
    }
    let started = false;
    const observer = new ResizeObserver(() => {
      if (!started) {
        started = true;
        return;
      }
      this.scheduleRefit(map, generation);
    });
    observer.observe(attribution);
    this.stopWatchingAttribution = () => observer.disconnect();
  }

  /**
   * Gives up on this build: the container puts its failure chrome up, so the map is released
   * rather than left holding a WebGL context behind it. A build that already lost its race, or
   * one that has already painted or failed, reports nothing.
   */
  private fail(reason: MapFailureReason, generation: number): void {
    if (generation !== this.generation || this.outcome !== 'pending') {
      return;
    }
    this.outcome = 'failed';
    this.removePopupsNow();
    this.map?.remove();
    this.map = undefined;
    this.failed.emit(reason);
  }

  /** Adds the spot source and its pins. */
  private drawSpots(map: MapLibreMap, collection: SpotCollection): void {
    map.addSource(SPOT_SOURCE_ID, {
      type: 'geojson',
      data: collection,
      // Promotes the spot id into the feature id, so selection can use feature state.
      promoteId: 'id',
    });
    for (const layer of SPOT_LAYERS) {
      map.addLayer(layer);
    }
  }

  /** Reports one spot-load milestone as the matching load event. */
  private reportSpots(event: SpotsLoadEvent, generation: number): void {
    const kinds = {
      sent: 'spots-sent',
      headers: 'spots-headers',
      fallback: 'spots-fallback',
      done: 'spots-done',
    } as const;
    this.reportLoad({ kind: kinds[event.type] }, generation);
  }

  /** Reports one load event for the container's loader, unless this build has been replaced. */
  private reportLoad(event: MapLoadEvent, generation: number): void {
    if (generation === this.generation) {
      this.loadEvent.emit(event);
    }
  }

  /** Whether the map's canvas host is at or under {@link NARROW_MAP_MAX_WIDTH_PX} wide. */
  private isNarrow(): boolean {
    return (
      this.canvasHost().nativeElement.offsetWidth <= NARROW_MAP_MAX_WIDTH_PX
    );
  }

  /**
   * Collapses the attribution control to its info button when `collapse` is set. MapLibre opens
   * it on a map of any width and only collapses it on the first drag, which on a phone leaves the
   * credits over half the map until the visitor happens to pan. This is the same collapse the
   * drag makes — the credits stay one tap away — and the control is the library's, so its CSS
   * class is the only handle there is.
   */
  private collapseAttributionOnNarrowMap(collapse: boolean): void {
    if (!collapse) {
      return;
    }
    this.canvasHost()
      .nativeElement.querySelector('.maplibregl-ctrl-attrib')
      ?.classList.remove('maplibregl-compact-show');
  }

  /**
   * Adds the relief and contours to a map that has already painted, once `pending` — a terrain
   * loader call made after `load` — resolves; a `null` result leaves the map flat. Terrain is
   * decoration, so a failure to add it is logged and never fails the map.
   */
  private async addElevation(
    map: MapLibreMap,
    pending: Promise<ElevationTiles | null>,
    generation: number,
  ): Promise<void> {
    const elevation = await pending;
    // A city switch, a retry or destruction may have replaced or released this map meanwhile.
    if (generation !== this.generation || this.map !== map) {
      return;
    }
    if (elevation === null) {
      return;
    }
    try {
      const additions = buildElevationAdditions(elevation);
      for (const [id, source] of Object.entries(additions.sources)) {
        map.addSource(id, source);
      }
      for (const { layer, beforeId } of additions.layers) {
        map.addLayer(layer, beforeId);
      }
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Whether this browser can draw the map at all. `webgl2` and nothing else: maplibre-gl v6
   * requests exactly that one context in `Map._setupPainter()` and throws
   * `GPUInitializationError` — "WebGL2 is required to display this map" — when it comes back
   * null (maplibre-gl-dev.mjs:27022-27023), which the `Map` constructor rethrows
   * (`:24123-24128`). A WebGL1 fallback here would wave through the very browsers the
   * renderer cannot run on — iOS 14, older Android WebViews — and they would reach the
   * factory only to have it throw.
   *
   * The probe's own context is handed straight back: this runs on every build, and the browser
   * caps how many contexts may be alive (QC6).
   */
  private hasWebGl(): boolean {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!context;
  }

  /** Releases the map's WebGL context — the browser caps how many may be alive at once. */
  private teardown(): void {
    this.generation += 1;
    this.superseded.next();
    this.outcome = 'pending';
    this.removePopupsNow();
    this.stopTrackingPointers?.();
    this.stopTrackingPointers = undefined;
    this.stopWatchingAttribution?.();
    this.stopWatchingAttribution = undefined;
    this.map?.remove();
    this.map = undefined;
  }
}

/** Whether the popup is still hidden, waiting for its pan to settle before it rises. */
function isPending(open: OpenPopup): boolean {
  return open.popup.getElement().classList.contains(POPUP_PENDING_CLASS);
}

/** Destroys a popup's component unless something already has. */
function destroyRef(ref: ComponentRef<SpotPopupComponent>): void {
  if (!ref.hostView.destroyed) {
    ref.destroy();
  }
}
