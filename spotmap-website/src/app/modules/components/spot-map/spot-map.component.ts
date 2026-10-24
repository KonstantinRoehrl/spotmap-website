import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
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
} from 'maplibre-gl';
import { filter, lastValueFrom, Subject, takeUntil, tap } from 'rxjs';
import { CityEnum } from '../../../models/enums/map-enum';
import { SpotListCollection } from '../../../models/spots/spot';
import {
  SpotListLoaded,
  SpotListLoadEvent,
  SpotsService,
} from '../../../services/spots.service';
import { demMaxzoomFor, type ElevationTiles } from './elevation';
import type { MapFailureReason } from '../../../models/map/map-failure-reason';
import type { MapLoadEvent } from '../../../models/map/map-load-event';
import { framingBounds } from './fit-bounds';
import { ELEVATION_LOADER, MAP_FACTORY } from './map-factory.token';
import { type PointerHold, trackPointerHold } from './pointer-hold';
import { SPOT_HIT_LAYER_ID, SPOT_LAYERS, SPOT_SOURCE_ID } from './spot-layers';
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
 * Draws a city's spots on a MapLibre map, reports the loaded spots, pin taps and taps on empty
 * map, and shows the selection its `selectedId` input names — the URL's, which is the selection's
 * one source (spec §7). The container owns the loading and failure chrome.
 *
 * MapLibre internals named in this file were read in maplibre-gl 6.15.0.
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

  /**
   * The spot the URL has open, or `null`. Shown as the selected pin once the pins are drawn; a
   * change never rebuilds the map.
   */
  selectedId = input<string | null>(null);

  /** The pins are on the painted map — the end of DRAW. */
  ready = output<void>();
  /** The map can never paint this build; the container shows its failure chrome for the reason. */
  failed = output<MapFailureReason>();
  /**
   * Every real loading milestone of the current build, for the loader's progress; DRAW's
   * completion is `ready`.
   */
  loadEvent = output<MapLoadEvent>();
  /**
   * The current build's spots in the list shape, as soon as they arrive and before the map
   * paints; never from a build a city switch, a retry or destruction has replaced.
   */
  spotsLoaded = output<SpotListCollection>();
  /**
   * A pin was tapped: its spot id. Selecting is the page's call — it navigates, and the URL comes
   * back as `selectedId` — so a tap alone selects nothing.
   */
  spotClick = output<string>();
  /** A tap on the map that hit no pin, which closes an open spot. */
  emptyClick = output<void>();

  private readonly canvasHost =
    viewChild.required<ElementRef<HTMLDivElement>>('canvasHost');
  private readonly spots = inject(SpotsService);
  private readonly mapFactory = inject(MAP_FACTORY);
  private readonly loadElevation = inject(ELEVATION_LOADER);

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

  /** The visitor's hold on the current map; set while a map is attached. */
  private pointerHold?: PointerHold;
  /** The selected pin of the current build; set once its pins are drawn. */
  private selection?: SpotSelection;

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

    // Before the pins are drawn there is nothing to select; `load` shows what the input says then.
    effect(() => {
      const id = this.selectedId();
      untracked(() => this.selection?.show(id, { pulse: true }));
    });
  }

  /**
   * Builds the map for `city`: fetches its spots, reports them, constructs a map already framed
   * on them, then attaches it and wires its listeners. Every await re-checks the generation, so a build that
   * lost its race to a teardown drops its result instead of attaching it.
   */
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

    let collection: SpotListCollection;
    try {
      const loaded = await lastValueFrom(
        this.spots.loadSpotList(city).pipe(
          tap((event) => this.reportSpots(event, generation)),
          filter((event): event is SpotListLoaded => event.type === 'done'),
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
    this.spotsLoaded.emit(collection);

    // The map is built already framed on the city: MapLibre applies `bounds` in its constructor
    // with no animation (`fitBounds` at `duration: 0`), so its first paint is the framed city and
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
      this.drawSpots(map, collection);
      // Feature state needs the spot source, so the selection starts here. One already in the URL
      // — a shared link opened cold, or a rebuild — is no tap, so it shows without the pulse.
      const selection = new SpotSelection(map);
      selection.show(this.selectedId(), { pulse: false });
      this.selection = selection;
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
      // Only now: `load` waits on every visible source's tiles, so terrain in the opening style
      // would hold the pins back behind the slowest DEM tile.
      // A missing terrain library resolves `null` — the loader never rejects — and leaves the map
      // flat.
      void this.addElevation(map, this.loadElevation(demMaxzoom), generation);
    });
  }

  /**
   * Wires the visitor-facing listeners: the attribution collapse when the map narrows, a pin tap
   * and a tap on empty map reported to the page, and the pointer cursor over a pin.
   */
  private wireInteractions(map: MapLibreMap, generation: number): void {
    // A phone turned from landscape to portrait narrows a map that opened wide, and MapLibre
    // only re-collapses its compact attribution on a drag, so the narrowing is caught here.
    map.on('resize', () => {
      if (generation !== this.generation || this.outcome !== 'painted') {
        return;
      }
      const narrow = this.isNarrow();
      this.collapseAttributionOnNarrowMap(narrow && !this.mapIsNarrow);
      this.mapIsNarrow = narrow;
    });

    // The rendered feature carries the spot id MapLibre promoted from its properties.
    map.on('click', SPOT_HIT_LAYER_ID, (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.id;
      if (generation === this.generation && id !== undefined) {
        this.spotClick.emit(String(id));
      }
    });

    // MapLibre fires the map's own click for a pin tap too, so only a click with no pin under it
    // is a tap on empty map.
    map.on('click', (event: MapMouseEvent) => {
      if (generation !== this.generation) {
        return;
      }
      if (
        map.queryRenderedFeatures(event.point, { layers: [SPOT_HIT_LAYER_ID] })
          .length > 0
      ) {
        return;
      }
      this.emptyClick.emit();
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
   * Gives up on this build: the container puts its failure chrome up, so the map is released
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
    this.map?.remove();
    this.map = undefined;
    this.failed.emit(reason);
  }

  /** Adds the spot source, in the list shape, and its pins. */
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
  }

  /** Reports one spot-load milestone as the matching load event. */
  private reportSpots(event: SpotListLoadEvent, generation: number): void {
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
    this.superseded.next();
    this.outcome = 'pending';
    // Before the map goes: a running pulse puts its ring to rest on the live style.
    this.selection?.dispose();
    this.selection = undefined;
    this.pointerHold?.stop();
    this.pointerHold = undefined;
    this.map?.remove();
    this.map = undefined;
  }
}
