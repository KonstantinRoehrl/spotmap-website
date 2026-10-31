import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type {
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
} from 'maplibre-gl';
import { CityEnum } from '../../../models/enums/map-enum';
import { SpotListCollection } from '../../../models/spots/spot';
import { type SpotIndex, spotIndexOf } from '../../../models/spots/spot-index';
import { SpotPhotos } from '../../../services/spot-photos.service';
import { canHover } from '../../../utils/input-capabilities';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { demMaxzoomFor, type ElevationTiles } from './elevation';
import {
  NO_INSETS,
  type AttributionCorner,
  type MapFocus,
  type MapInsets,
  type ViewBounds,
} from '../../../models/map/map-camera';
import type { MapFailureReason } from '../../../models/map/map-failure-reason';
import type { MapLoadEvent } from '../../../models/map/map-load-event';
import { framingBounds } from './fit-bounds';
import { ELEVATION_LOADER, MAP_FACTORY } from './map-factory.token';
import {
  FLAG_REACH_PX,
  isOnPinImageBody,
  isOnRaisedFlag,
  PhotoPins,
} from './photo-pins';
import { type PointerHold, trackPointerHold } from './pointer-hold';
import {
  boundsOfRect,
  type CameraFrame,
  sameFrame,
  SelectionCamera,
  uncoveredRect,
} from './selection-camera';
import { type FlagView, SelectionFlag } from './selection-flag';
import {
  PHOTO_PIN_LAYERS,
  PHOTO_PIN_TARGET_LAYER_IDS,
  PIN_TARGET_LAYER_IDS,
  SPOT_FOOTPRINT_IMAGE_ID,
  SPOT_FOOTPRINT_LAYER,
  SPOT_LAYERS,
  SPOT_PHOTO_LAYER_ID,
  SPOT_SOURCE_ID,
  spotFootprintImage,
} from './spot-layers';
import { SpotSelection } from './spot-selection';
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

/**
 * A map whose uncovered part — what the page's covered strips leave of it — is shorter than this
 * has its attribution collapsed to the info button, on the same two moments as the width rule.
 * The expanded credits on a wide map are 124 px tall; about twice that, rounded to 240 px, leaves a
 * selected pin room beside them, where a shorter strip has the panel fill it and hide the pin, its
 * ring and its flag.
 */
const MIN_UNCOVERED_HEIGHT_FOR_CREDITS_PX = 240;

/**
 * Whether a MapLibre `error` means a source the style cannot do without never came up — the one
 * failure this map can never paint through. Both fields are read off the payload, since neither
 * is declared on maplibre-gl's public `ErrorEvent`:
 *
 * - `sourceId` is attached to every event bubbling out of a source's tile manager (the
 *   evented-parent data `Style` gives each `TileManager`), so an error fired on the style itself
 *   — `Source layer … does not exist` from `Style._validateLayer` — carries none, and a map that
 *   can still paint is left alone.
 * - `tile` is attached only when a single tile failed (`TileManager._loadTile`'s catch; a 404
 *   fires nothing at all). A glyph range is fetched while a tile is parsed, so it arrives the
 *   same way.
 * - a source that did come up fired `data`/`metadata` first (`VectorTileSource.load`) — the
 *   success branch its catch skips — so a source still awaiting metadata never loaded.
 *
 * `map.isStyleLoaded()` is no use here: it already reports `true` by the time a source error
 * reaches this handler, because the tile manager's own `error` listener sets `_sourceErrored`,
 * which short-circuits `TileManager.loaded()` and with it `Style.loaded()`.
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
 * The tooltip card's outer width, in px, padding and border included: the `.spot-map__tooltip-card`
 * width in the stylesheet, which sets `border-box` itself so the figure holds without the global
 * reset.
 */
const TOOLTIP_WIDTH_PX = 132;

/** The gap, in px, between the pin and its tooltip card: the card's offset in the stylesheet. */
const TOOLTIP_PIN_GAP_PX = 16;

/** The clear space, in px, the tooltip keeps from the map's edges. */
const TOOLTIP_EDGE_GAP_PX = 8;

/** The tallest a card with a cover photo gets, in px: 4:3 photo plus a three-line name. */
const TOOLTIP_PHOTO_CARD_HEIGHT_PX = 156;

/** The tallest a name-only plate gets, in px: a three-line name. */
const TOOLTIP_PLATE_HEIGHT_PX = 60;

/** What a started build decided up front, for its map to be constructed from once the spots are in. */
interface PendingBuild {
  /** Where the map opens instead of the city's framing, read once as the build starts. */
  readonly focus: MapFocus | null;
  /** The elevation zoom for the build's city. */
  readonly demMaxzoom: number;
}

/** What the hover tooltip shows, and where: the hovered pin's canvas position. */
interface SpotTooltip {
  /**
   * What identifies the card, for the template to track it by: the hovered spot's id, so a move to
   * another pin crossfades. Under reduced motion, where a card cannot slide to the other side of its
   * pin, the side joins it, so a flip fades the old card out and a new one in instead of cutting.
   */
  readonly key: string;
  /** The hovered spot's id. */
  readonly id: string;
  /** The spot's name, the tooltip's text. */
  readonly name: string;
  /** The cover's thumbnail URL, or `null` for a name-only plate. */
  readonly photo: string | null;
  /** The pin's canvas x, in px. */
  readonly x: number;
  /** The pin's canvas y, in px. */
  readonly y: number;
  /** Whether the card sits below the pin because there is no room above it. */
  readonly below: boolean;
  /** How far the card slides sideways to stay inside the map, in px. */
  readonly shift: number;
}

/** The spot id a rendered pin feature carries: its promoted feature id, else its `id` property. */
function spotIdOf(feature: MapGeoJSONFeature | undefined): string | undefined {
  const id = feature?.id ?? feature?.properties?.['id'];
  return id === undefined ? undefined : String(id);
}

/**
 * Draws a city's spots on a MapLibre map, reports pin taps and taps on empty map, and shows the
 * selection its `selectedId` input names — the URL's, which is the selection's one source. The
 * spots come in through {@link spots}: the page's store loads them, and the map is constructed from
 * them. The page owns the loading and failure chrome. With a photo host it
 * frames each spot's first photo on its pin where there is room, and raises the selected one's out
 * of its pin as an amber flag drawn over the map ({@link SelectionFlag}); a hovered pin lights and
 * shows a tooltip.
 *
 * MapLibre internals named in this file were read in maplibre-gl 6.15.0.
 */
@Component({
  selector: 'app-spot-map',
  imports: [],
  templateUrl: './spot-map.component.html',
  styleUrl: './spot-map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.spot-map--attribution-top]': "attributionCorner() === 'top-right'",
  },
})
export class SpotMapComponent {
  /** The city whose spots are drawn; any change rebuilds the map on that city. */
  city = input.required<CityEnum>();

  /** Bumped by the store on RETRY; any change rebuilds the map from scratch. */
  retryToken = input.required<number>();
  /** The current build's spots; null until they arrive. The map is constructed from them. */
  spots = input.required<SpotListCollection | null>();

  /**
   * The spot the URL has open, or `null`. Shown as the selected pin once the pins are drawn; a
   * change never rebuilds the map.
   */
  selectedId = input<string | null>(null);
  /**
   * How much of the map's edges the page's own UI covers, in px — a phone's sheet along the
   * bottom. The visible bounds and the selected pin's framing leave those strips out.
   */
  coveredInsets = input<MapInsets>(NO_INSETS);
  /**
   * Where the next build opens instead of the city's framing — a cold `/spot/<id>` link's spot.
   * Read once per build, as the build starts; a later change waits for the next city switch.
   */
  openOn = input<MapFocus | null>(null);
  /**
   * The corner the attribution sits in. `top-right` on the sheet layout, which covers the bottom
   * edge: the credit is a licence condition and must stay visible.
   */
  attributionCorner = input<AttributionCorner>('bottom-right');
  /** The spot a pointer or its list row hovers, or `null`: its pin lights and its tooltip shows. */
  hoveredId = input<string | null>(null);

  /** The pins are on the painted map — the end of DRAW. */
  ready = output<void>();
  /** The map can never paint this build; the page shows its failure chrome for the reason. */
  failed = output<MapFailureReason>();
  /**
   * Every real loading milestone of the current build, for the loader's progress; DRAW's
   * completion is `ready`.
   */
  loadEvent = output<MapLoadEvent>();
  /**
   * A pin was tapped: its spot id. Selecting is the page's call — it navigates, and the URL comes
   * back as `selectedId` — so a tap alone selects nothing.
   */
  spotClick = output<string>();
  /** A tap on the map that hit no pin, which closes an open spot. */
  emptyClick = output<void>();
  /**
   * The bounds of the uncovered part of the map, on paint, on every move (at most once a frame)
   * and whenever the covered strips change; never from a build that has been replaced.
   */
  boundsChange = output<ViewBounds>();
  /** The pin under a hovering pointer, or `null` once it leaves; only from pointers that hover. */
  pinHover = output<string | null>();

  private readonly canvasHost =
    viewChild.required<ElementRef<HTMLDivElement>>('canvasHost');
  private readonly mapFactory = inject(MAP_FACTORY);
  private readonly loadElevation = inject(ELEVATION_LOADER);
  /** Where the photos come from; with no photo host there are no photo pins or tooltip photos. */
  private readonly spotPhotos = inject(SpotPhotos);
  /** Runs the selection flag's timers outside the zone, so a landing flag never holds `whenStable`. */
  private readonly zone = inject(NgZone);

  private map?: MapLibreMap;

  /**
   * Whether the map was last measured too cramped to hold the expanded credits — at or under
   * {@link NARROW_MAP_MAX_WIDTH_PX} wide, or with an uncovered part under
   * {@link MIN_UNCOVERED_HEIGHT_FOR_CREDITS_PX} tall — so a resize collapses the attribution on
   * the way in and never again while the visitor has it open there.
   */
  private mapIsCramped = false;

  /**
   * Latched the moment the map either paints or gives up, so one map can never report both
   * `ready` and `failed`. Every teardown resets it, because the next build is a new map.
   */
  private outcome: 'pending' | 'painted' | 'failed' = 'pending';

  /** The build under way; null after a teardown and for a browser that cannot draw the map. */
  private readonly currentBuild = signal<PendingBuild | null>(null);
  /** Whether the current build has started constructing its map; every teardown resets it. */
  private constructionStarted = false;

  /** The visitor's hold on the current map; set while a map is attached. */
  private pointerHold?: PointerHold;
  /** The selected pin of the current build; set once its pins are drawn. */
  private selection?: SpotSelection;
  /** Keeps the current build's selected pin in view; set once its pins are drawn. */
  private camera?: SelectionCamera;
  /** The current build's spots by id, for a selected id's coordinates; set once its pins are drawn. */
  private spotIndex?: SpotIndex;
  /**
   * The frame the selection was last kept in view in. A change detection that hands over an equal
   * but new `coveredInsets` object must not re-centre a map the visitor has panned since.
   */
  private framedFor?: CameraFrame;
  /** The animation frame the next bounds report and the tooltip's and flag's positions wait on. */
  private boundsFrame?: number;
  /** The current build's photo pin images; set once its pins are drawn, with a photo host only. */
  private photoPins?: PhotoPins;
  /** The current build's selection flag; set once its pins are drawn, with a photo host only. */
  private selectionFlag?: SelectionFlag;
  /** The flags drawn over the map: the selected spot's, and one still falling back into its pin. */
  protected readonly flags = signal<readonly FlagView[]>([]);
  /** The pin whose `hovered` feature state is set on the current map. */
  private hoveredOnMap: string | null = null;
  /** The pin last reported under the pointer, so a pointer moving over one pin reports it once. */
  private pinUnderPointer: string | null = null;
  /** The hover tooltip, or `null` while none shows. */
  private readonly tooltip = signal<SpotTooltip | null>(null);
  /**
   * The tooltip as a list of at most one, so the template can key its card by spot id: the card
   * leaving and the next one arriving fade past each other instead of one card jumping pins.
   */
  protected readonly tooltips = computed(() => {
    const tip = this.tooltip();
    return tip ? [tip] : [];
  });

  /**
   * Bumped by every teardown. A build whose await resolves against a stale generation lost its
   * race with a city switch, a retry, or destruction, and throws its map away instead of
   * attaching it.
   */
  private generation = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      // A destroyed component's outputs are closed, so teardown has no hover left to report.
      this.pinUnderPointer = null;
      this.teardown();
    });

    // The page reuses this instance across city selections and retries, so both inputs re-arm the
    // renderer: drop the old map, releasing its WebGL context, and start a new build.
    effect(() => {
      const city = this.city();
      this.retryToken();
      untracked(() => {
        this.teardown();
        this.startBuild(city);
      });
    });

    // Declared after the effect above, which on a retry or a city switch tears down first. Tracks
    // `currentBuild` too: a reload that hands back the same collection object leaves `spots`
    // unchanged, and this effect must still run for the new build.
    effect(() => {
      const build = this.currentBuild();
      const spots = this.spots();
      if (build !== null && spots !== null) {
        untracked(() => void this.construct(build, spots));
      }
    });

    // The URL owns the selection and the page the covered strips. Before the pins are drawn
    // there is nothing to select or frame; `load` applies whatever the inputs say then.
    effect(() => {
      this.selectedId();
      this.coveredInsets();
      untracked(() => {
        this.followSelection();
        this.scheduleBounds();
        this.updateTooltip();
      });
    });

    // A hovered pin or list row lights its pin and shows its tooltip, once the pins are drawn.
    effect(() => {
      this.hoveredId();
      untracked(() => {
        this.showHover();
        this.updateTooltip();
      });
    });
  }

  /**
   * Starts a build for `city`: reads where it opens, refuses a browser that can never draw this
   * map, and warms the terrain imports. The map itself waits for {@link spots}.
   */
  private startBuild(city: CityEnum): void {
    // Read now, while it belongs to the city this build is for.
    const focus = this.openOn();

    // Probed first: a browser without WebGL can never draw this map, and the frame withholds RETRY
    // for `unsupported`. The store's list loads regardless, and the page lists everything.
    if (!this.hasWebGl()) {
      this.fail('unsupported', this.generation);
      return;
    }

    // Elevation is decoration, so nothing waits on it. This call only warms the loader: it starts
    // the terrain library imports alongside the store's spot request and the map's own chunk, and
    // its result is ignored. The result that counts comes from a second call after `load`, so the
    // loader's timeout bounds how long after `load` relief may still be added rather than how long
    // after the build began — a phone whose map paints late would otherwise lose relief the
    // library already had ready. The loader memoises its setup, so that second call reuses these
    // imports.
    const demMaxzoom = demMaxzoomFor(city);
    void this.loadElevation(demMaxzoom);

    this.currentBuild.set({ focus, demMaxzoom });
  }

  /**
   * Constructs `build`'s map already framed on `collection`, or on the spot a cold link opened, then
   * attaches it and wires its listeners. Once per build; the await re-checks the generation, so a
   * build that lost its race to a teardown drops its map instead of attaching it.
   */
  private async construct(
    { focus, demMaxzoom }: PendingBuild,
    collection: SpotListCollection,
  ): Promise<void> {
    // `map` is only assigned after the await, so "no map yet" could not stop a second list in the
    // same build from constructing a second map and leaking its WebGL context.
    if (this.constructionStarted || this.outcome !== 'pending') {
      return;
    }
    this.constructionStarted = true;
    const generation = this.generation;

    // The map is built already framed on the city: MapLibre applies `bounds` in its constructor
    // with no animation (`fitBounds` at `duration: 0`), so its first paint is the framed city and
    // no opening camera move follows it. A cold link opens on its spot instead, and MapLibre
    // applies `center` and `zoom` in its constructor the same way.
    const camera = focus
      ? { center: focus.center, zoom: focus.zoom }
      : {
          bounds:
            framingBounds(
              collection.features.map(
                (feature) => feature.geometry.coordinates,
              ),
            ) ?? undefined,
          fitBoundsOptions: { padding: FIT_PADDING_PX, maxZoom: FIT_MAX_ZOOM },
        };

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
        ...camera,
        // Attribution is a licence condition of the OSM-derived tiles, never optional.
        attributionControl: { compact: true },
      });
    } catch (error) {
      // Either maplibre-gl's lazy chunk never arrived — after a redeploy a client holding a
      // cached index.html asks for a hashed chunk that is gone — or the `Map` constructor threw
      // because the GPU would not give it a context the probe just held. Both are a build that
      // failed rather than a browser that can never render, so RETRY is worth offering. Saying
      // so here is the only way it gets said at all: `construct()` is launched with `void`, so an
      // escaping rejection leaves the page on its spinner until the frame's watchdog gives up.
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
    this.attachMap(map, generation);
    this.wireLoadTelemetry(
      map,
      collection,
      generation,
      sourcesAwaitingMetadata,
      demMaxzoom,
    );
    this.wireInteractions(map, generation);
  }

  /**
   * Takes on the map a build has just been handed: tracks the visitor's hold on it, reports the
   * renderer ready and locks the map flat and north-up. Both locks are synchronous and land
   * before the first frame, so they may run ahead of the listeners.
   */
  private attachMap(map: MapLibreMap, generation: number): void {
    this.map = map;
    this.pointerHold = trackPointerHold(map);
    this.reportLoad({ kind: 'renderer-ready' }, generation);

    // Rotation and pitch are off: the map stays flat and north-up whatever the gesture. Four
    // handlers can move those two degrees of freedom and each needs its own switch — MapLibre
    // wires them separately (`HandlerManager._addDefaultHandlers`) and `handleEvent` skips only
    // the ones reporting `isEnabled() === false`. `dragRotate.disable()` reaches the mouse
    // rotate/pitch/roll trio alone and `touchZoomRotate.disableRotation()` the two-finger twist
    // alone, which leaves the two-finger tilt and Shift+Arrow live by default (the map's
    // `touchPitch` and `keyboard` options default to on). Keyboard pan and zoom stay:
    // `KeyboardHandler.disableRotation()` zeroes only the bearing and pitch steps, and arrow keys
    // are the only pointer-free way to move.
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    map.keyboard.disableRotation();
  }

  /**
   * Reports every MapLibre milestone of this build up to the paint, fails the build when an error
   * names a source the map cannot paint without, and on `load` draws the pins, shows the URL's
   * selection, emits `ready` once the pins are on screen, collapses the attribution and adds the
   * relief.
   */
  private wireLoadTelemetry(
    map: MapLibreMap,
    collection: SpotListCollection,
    generation: number,
    sourcesAwaitingMetadata: Set<string>,
    demMaxzoom: number,
  ): void {
    // A style passed as an object is loaded a frame after construction (`Style.loadJSON` waits a
    // frame before `_load`), so this listener still hears it.
    map.on('style.load', () => {
      this.reportLoad({ kind: 'style-loaded' }, generation);
    });

    // Basemap tiles only, and only until the paint: relief tiles must never hold the reveal. A
    // tile request fires `sourcedataloading` with its tile only on a cache miss, a loaded tile
    // `sourcedata` with its tile, and an aborted one `sourcedataabort`; a 404 fires nothing
    // (`TileManager._addTile`, `_tileLoaded`, `_abortTile` and `_loadTile`).
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
      // error to the console only while nothing listens for it. Both outcomes below need it
      // back — a fatal one shows the user four words, and a map that paints on without its
      // glyphs shows nothing at all.
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
      const spotIndex = spotIndexOf(collection);
      // The resolver must be in place before the layers that ask it for images.
      if (this.spotPhotos.enabled) {
        this.photoPins = new PhotoPins(map, spotIndex, this.spotPhotos);
        this.photoPins.install();
      }
      this.drawSpots(map, collection);
      // Feature state needs the spot source, so the selection starts here. One already in the URL
      // — a shared link opened cold, or a rebuild — is no tap: it shows without the pulse, and the
      // camera seats it in the middle of the uncovered part without animation.
      this.spotIndex = spotIndex;
      this.selection = new SpotSelection(map);
      if (this.photoPins) {
        // Its signal write still schedules the render from outside the zone.
        this.selectionFlag = new SelectionFlag(
          map,
          (views) => this.flags.set(views),
          (run, ms) => this.zone.runOutsideAngular(() => setTimeout(run, ms)),
        );
      }
      this.camera = new SelectionCamera(
        map,
        () => this.pointerHold?.isHeld() ?? false,
      );
      const id = this.selectedId();
      this.selection.show(id, { pulse: false });
      this.showFlag(id, false);
      const frame = this.cameraFrame();
      this.framedFor = frame;
      const pin = id === null ? null : this.coordinatesOf(id);
      if (pin) {
        this.camera.place(pin, frame);
      }
      this.emitBounds();
      this.showHover();
      this.updateTooltip();
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
      this.mapIsCramped = this.isCramped();
      this.collapseAttributionOnCrampedMap(this.mapIsCramped);
      // Only now: `load` waits on every visible source's tiles, so terrain in the opening style
      // would hold the pins back behind the slowest DEM tile.
      // A missing terrain library resolves `null` — the loader never rejects — and leaves the map
      // flat.
      void this.addElevation(map, this.loadElevation(demMaxzoom), generation);
    });
  }

  /**
   * Wires the visitor-facing listeners: the attribution collapse when the map becomes cramped, a
   * pin tap and a tap on empty map reported to the page, and the pointer cursor and hover over a
   * pin, a photo frame or the raised flag.
   */
  private wireInteractions(map: MapLibreMap, generation: number): void {
    // A phone turned from landscape to portrait narrows a map that opened wide, and a sheet that
    // grows can leave a wide map's uncovered strip short; MapLibre only re-collapses its compact
    // attribution on a drag, so both are caught here.
    map.on('resize', () => {
      if (generation !== this.generation || this.outcome !== 'painted') {
        return;
      }
      const cramped = this.isCramped();
      this.collapseAttributionOnCrampedMap(cramped && !this.mapIsCramped);
      this.mapIsCramped = cramped;
      this.scheduleBounds();
    });

    map.on('move', () => {
      if (generation === this.generation) {
        this.scheduleBounds();
      }
    });

    // One feature query serves the tap, the cursor and the hover: it asks about every layer a
    // pointer can hit, so the photo frames take them as the dot does, and a tap on any of them is
    // never mistaken for a tap on empty map. The raised flag stands over the map and hides what
    // lies under it, so a point on it is the selected spot's before anything is asked.
    map.on('click', (event: MapMouseEvent) => {
      if (generation !== this.generation || this.outcome !== 'painted') {
        return;
      }
      const flagged = this.flagUnder(map, event.point);
      if (flagged !== null) {
        this.spotClick.emit(flagged);
        return;
      }
      const hits = this.pinsAt(map, event);
      if (hits.length === 0) {
        this.emptyClick.emit();
        return;
      }
      const id = this.spotUnder(map, event.point, hits);
      if (id !== undefined) {
        this.spotClick.emit(id);
      }
    });

    // A pointer over a pin should say it can be tapped, and hover is reported only from a pointer
    // that can hover, so a tap leaves no tooltip behind.
    map.on('mousemove', (event: MapMouseEvent) => {
      if (generation !== this.generation || this.outcome !== 'painted') {
        return;
      }
      const id =
        this.flagUnder(map, event.point) ??
        this.spotUnder(map, event.point, this.pinsAt(map, event)) ??
        null;
      map.getCanvas().style.cursor = id === null ? '' : 'pointer';
      if (canHover()) {
        this.reportPinHover(id);
      }
    });
    map.on('mouseout', () => {
      map.getCanvas().style.cursor = '';
      if (generation === this.generation) {
        this.reportPinHover(null);
      }
    });
  }

  /** The pin features under the pointer, topmost first: dots, and photo frames if drawn. */
  private pinsAt(map: MapLibreMap, event: MapMouseEvent): MapGeoJSONFeature[] {
    return map.queryRenderedFeatures(event.point, {
      layers: [
        ...(this.photoPins ? PHOTO_PIN_TARGET_LAYER_IDS : PIN_TARGET_LAYER_IDS),
      ],
    });
  }

  /**
   * The spot the pointer at `point` is on, out of the pin `hits` under it (topmost first), or
   * `undefined` for none. MapLibre answers a photo frame with its whole image box, whose
   * foot is transparent, so the topmost hit alone would send a pointer on a dot showing through that
   * foot to the frame's spot. Instead the opaque body of a frame wins, topmost first, and
   * anywhere else the nearest pin to the pointer does: a dot sits on its own spot's coordinates.
   */
  private spotUnder(
    map: MapLibreMap,
    point: { x: number; y: number },
    hits: MapGeoJSONFeature[],
  ): string | undefined {
    const pins = hits.flatMap((hit) => {
      const id = spotIdOf(hit);
      const coordinates = id === undefined ? null : this.coordinatesOf(id);
      return id === undefined
        ? []
        : [
            {
              id,
              framed: hit.layer?.id === SPOT_PHOTO_LAYER_ID,
              at: coordinates ? map.project(coordinates) : null,
            },
          ];
    });
    const onBody = pins.find(
      (pin) => pin.framed && pin.at && isOnPinImageBody(pin.at, point),
    );
    if (onBody) {
      return onBody.id;
    }
    let nearest = pins[0];
    let nearestDistance = Infinity;
    for (const pin of pins) {
      const distance = pin.at
        ? Math.hypot(pin.at.x - point.x, pin.at.y - point.y)
        : Infinity;
      if (distance < nearestDistance) {
        nearest = pin;
        nearestDistance = distance;
      }
    }
    return nearest?.id;
  }

  /**
   * Shows the URL's selection and keeps its pin in view: a spot opened, switched to or reframed
   * has its pin eased into view when it is not already there. A close moves nothing; the map stays
   * where the visitor has it. Nothing happens before the pins are drawn.
   */
  private followSelection(): void {
    const { selection, camera } = this;
    if (!selection || !camera) {
      return;
    }
    const id = this.selectedId();
    const previous = selection.selectedId;
    const frame = this.cameraFrame();
    const reframed =
      this.framedFor === undefined || !sameFrame(this.framedFor, frame);
    this.framedFor = frame;
    selection.show(id, { pulse: true });
    this.showFlag(id, true);
    if (id === null) {
      return;
    }
    const pin = this.coordinatesOf(id);
    if (pin && (previous !== id || reframed)) {
      camera.keepInView(pin, frame);
    }
  }

  /** The canvas host's size with the page's covered strips and the flag's reach, as the camera reads it. */
  private cameraFrame(): CameraFrame {
    const host = this.canvasHost().nativeElement;
    return {
      width: host.clientWidth,
      height: host.clientHeight,
      insets: this.coveredInsets(),
      headroom: this.flagReach(),
    };
  }

  /** How far above its pin the selected spot's flag reaches, or 0 when it flies none. */
  private flagReach(): number {
    return this.photoPins && this.hasCover(this.selectedId())
      ? FLAG_REACH_PX
      : 0;
  }

  /**
   * Flies the selected spot's photo as the flag, or lowers it: `animate` for a selection the
   * visitor made, not for one a build opened with. A spot without a photo flies none, and a map
   * without a photo host has no flag at all.
   */
  private showFlag(id: string | null, animate: boolean): void {
    const flag = this.selectionFlag;
    if (!flag) {
      return;
    }
    const spot = id === null ? undefined : this.spotIndex?.get(id);
    const photo = this.spotPhotos.coverThumb(spot?.properties);
    flag.show(
      spot && photo
        ? {
            id: spot.properties.id,
            photo,
            demolished: spot.properties.status === 'demolished',
            coordinates: spot.geometry.coordinates,
          }
        : null,
      { animate, reduced: prefersReducedMotion() },
    );
  }

  /**
   * The selected spot when `point` is on its raised flag's photo, else `null`. The flag stands over
   * the map, so whatever MapLibre finds under it, neighbouring dots and photo pins included, is
   * hidden by it.
   */
  private flagUnder(
    map: MapLibreMap,
    point: { x: number; y: number },
  ): string | null {
    const raised = this.flags().find(
      (flag) => flag.phase === 'rising' || flag.phase === 'raised',
    );
    const coordinates = raised ? this.coordinatesOf(raised.id) : null;
    return raised &&
      coordinates &&
      isOnRaisedFlag(map.project(coordinates), point)
      ? raised.id
      : null;
  }
  /** Where the current build draws the spot `id`, or `null` for a spot it does not hold. */
  private coordinatesOf(id: string): [number, number] | null {
    return this.spotIndex?.get(id)?.geometry.coordinates ?? null;
  }

  /** Reports the bounds, and moves the tooltip and the flag, on the next animation frame, once however many moves ask for it. */
  private scheduleBounds(): void {
    if (
      this.boundsFrame !== undefined ||
      !this.map ||
      this.outcome !== 'painted'
    ) {
      return;
    }
    this.boundsFrame = requestAnimationFrame(() => {
      this.boundsFrame = undefined;
      this.emitBounds();
      this.updateTooltip();
      this.selectionFlag?.reposition();
    });
  }

  /** Whether the current build's spot `id` has a photo. */
  private hasCover(id: string | null): boolean {
    return (
      id !== null &&
      (this.spotIndex?.get(id)?.properties.cover ?? null) !== null
    );
  }

  /** Moves the `hovered` feature state to the pin `hoveredId` names, once the pins are drawn. */
  private showHover(): void {
    const map = this.map;
    const id = this.hoveredId();
    if (!map || !this.selection || id === this.hoveredOnMap) {
      return;
    }
    if (this.hoveredOnMap !== null) {
      map.removeFeatureState(
        { source: SPOT_SOURCE_ID, id: this.hoveredOnMap },
        'hovered',
      );
    }
    if (id !== null) {
      map.setFeatureState({ source: SPOT_SOURCE_ID, id }, { hovered: true });
    }
    this.hoveredOnMap = id;
  }

  /** Reports the pin under the pointer when it changes. */
  private reportPinHover(id: string | null): void {
    if (id !== this.pinUnderPointer) {
      this.pinUnderPointer = id;
      this.pinHover.emit(id);
    }
  }

  /**
   * Shows the tooltip above the hovered pin — below it near the top edge, and kept inside the map
   * sideways — never for the selected one, whose detail is open; or hides it. Repositioned once a
   * frame while the map moves.
   */
  private updateTooltip(): void {
    const map = this.map;
    const id = this.hoveredId();
    const spot =
      !map || !this.selection || id === null || id === this.selectedId()
        ? undefined
        : this.spotIndex?.get(id);
    if (!map || !spot) {
      if (this.tooltip() !== null) {
        this.tooltip.set(null);
      }
      return;
    }
    const { x, y } = map.project(spot.geometry.coordinates);
    const photo = this.spotPhotos.coverThumb(spot.properties);
    // The card is centred on the pin, above it. Near an edge it slides back inside the map, and
    // with no room above it flips below the pin.
    const reach = TOOLTIP_WIDTH_PX / 2 + TOOLTIP_EDGE_GAP_PX;
    const { clientWidth } = this.canvasHost().nativeElement;
    const centre = Math.min(
      Math.max(x, reach),
      Math.max(reach, clientWidth - reach),
    );
    const height = photo
      ? TOOLTIP_PHOTO_CARD_HEIGHT_PX
      : TOOLTIP_PLATE_HEIGHT_PX;
    const below = y - TOOLTIP_PIN_GAP_PX - height < TOOLTIP_EDGE_GAP_PX;
    this.tooltip.set({
      key:
        below && prefersReducedMotion()
          ? `${spot.properties.id}:below`
          : spot.properties.id,
      id: spot.properties.id,
      name: spot.properties.name,
      photo,
      x,
      y,
      below,
      shift: centre - x,
    });
  }

  /** Reports the uncovered part of the painted map's bounds. */
  private emitBounds(): void {
    const map = this.map;
    if (!map || this.outcome !== 'painted') {
      return;
    }
    const { width, height, insets } = this.cameraFrame();
    this.boundsChange.emit(
      boundsOfRect(map, uncoveredRect(width, height, insets)),
    );
  }

  /**
   * Forgets the current build's camera, spots and frame and cancels its pending bounds report, so
   * nothing from a released map reaches the build that replaces it.
   */
  private releaseCamera(): void {
    this.camera = undefined;
    this.spotIndex = undefined;
    this.framedFor = undefined;
    if (this.boundsFrame !== undefined) {
      cancelAnimationFrame(this.boundsFrame);
      this.boundsFrame = undefined;
    }
  }

  /**
   * Lets go of the current build's photo pins — their listeners, frames and pending fetches — and
   * its selection flag — its timers and render listener — and forgets its hover, tooltip and
   * flags. Called before the map is removed.
   */
  private releaseHover(): void {
    this.photoPins?.dispose();
    this.photoPins = undefined;
    this.selectionFlag?.dispose();
    this.selectionFlag = undefined;
    this.flags.set([]);
    this.hoveredOnMap = null;
    // The removed map never fires `mouseleave`, so the page is told the hover is gone here.
    this.reportPinHover(null);
    this.tooltip.set(null);
  }

  /**
   * Gives up on this build: the page puts its failure chrome up, so the map is released
   * rather than left holding a WebGL context behind it. A build that already lost its race, or
   * one that has already painted or failed, reports nothing.
   */
  private fail(reason: MapFailureReason, generation: number): void {
    if (generation !== this.generation || this.outcome !== 'pending') {
      return;
    }
    this.outcome = 'failed';
    this.selection?.dispose();
    this.selection = undefined;
    this.releaseCamera();
    this.releaseHover();
    this.map?.remove();
    this.map = undefined;
    this.failed.emit(reason);
  }

  /**
   * Adds the spot source, in the list shape, its pins, with a photo host the photo pins,
   * and the dot footprints last. On top, the footprints are placed first, so every photo pin and
   * basemap label placed after them keeps off the dots. They go on every map: without a photo host
   * they still keep the labels clear.
   */
  private drawSpots(map: MapLibreMap, collection: SpotListCollection): void {
    map.addSource(SPOT_SOURCE_ID, {
      type: 'geojson',
      data: collection,
      // Promotes the spot id into the feature id, so selection can use feature state.
      promoteId: 'id',
    });
    for (const layer of SPOT_LAYERS) {
      map.addLayer(layer);
    }
    if (this.photoPins) {
      for (const layer of PHOTO_PIN_LAYERS) {
        map.addLayer(layer);
      }
    }
    map.addImage(SPOT_FOOTPRINT_IMAGE_ID, spotFootprintImage(), {
      pixelRatio: 1,
    });
    map.addLayer(SPOT_FOOTPRINT_LAYER);
  }

  /** Reports one load event for the page's loader, unless this build has been replaced. */
  private reportLoad(event: MapLoadEvent, generation: number): void {
    if (generation === this.generation) {
      this.loadEvent.emit(event);
    }
  }

  /**
   * Whether the map is too cramped for the expanded credits: its canvas host is at or under
   * {@link NARROW_MAP_MAX_WIDTH_PX} wide, or the part of it the covered strips leave open is under
   * {@link MIN_UNCOVERED_HEIGHT_FOR_CREDITS_PX} tall. The height is read off the same camera frame
   * the bounds report uses.
   */
  private isCramped(): boolean {
    const { width, height, insets } = this.cameraFrame();
    const uncovered = uncoveredRect(width, height, insets);
    return (
      this.canvasHost().nativeElement.offsetWidth <= NARROW_MAP_MAX_WIDTH_PX ||
      uncovered.bottom - uncovered.top < MIN_UNCOVERED_HEIGHT_FOR_CREDITS_PX
    );
  }

  /**
   * Collapses the attribution control to its info button when `collapse` is set. MapLibre opens
   * it on a map of any width and only collapses it on the first drag, which on a phone leaves the
   * credits over half the map, and on a short uncovered strip over the selected pin, until the
   * visitor happens to pan. This is the same collapse the drag makes — the credits stay one tap
   * away — and the control is the library's, so its CSS class is the only handle there is.
   */
  private collapseAttributionOnCrampedMap(collapse: boolean): void {
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
   * null, which the `Map` constructor rethrows after cleaning up its container. A WebGL1
   * fallback here would wave through the very browsers the renderer cannot run on — iOS 14,
   * older Android WebViews — and they would reach the factory only to have it throw.
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
    this.currentBuild.set(null);
    this.constructionStarted = false;
    this.outcome = 'pending';
    // Before the map goes: a running pulse puts its ring to rest on the live style.
    this.selection?.dispose();
    this.selection = undefined;
    this.pointerHold?.stop();
    this.pointerHold = undefined;
    this.releaseCamera();
    this.releaseHover();
    this.map?.remove();
    this.map = undefined;
  }
}
