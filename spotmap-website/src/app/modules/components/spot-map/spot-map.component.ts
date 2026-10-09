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
  Popup as MapLibrePopup,
} from 'maplibre-gl';
import { firstValueFrom } from 'rxjs';
import { CityEnum, MapFailureReason } from '../../../models/enums/map-enum';
import { SpotCollection } from '../../../models/spots/spot';
import { SpotsService } from '../../../services/spots.service';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import {
  SPOT_POPUP_FRAME_CLASS,
  SpotPopupComponent,
} from '../spot-popup/spot-popup.component';
import type { ElevationTiles } from './elevation';
import { startLockOn } from './lock-on-pulse';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
  POPUP_FACTORY,
} from './map-factory.token';
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

/** How long the opening fit-to-spots camera move takes, unless reduced motion is requested. */
const FIT_DURATION_MS = 600;

/** Wide enough for the photo gallery, narrow enough to leave the map readable behind it. */
const POPUP_MAX_WIDTH = '320px';

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

/** Draws a city's spots on a MapLibre map. The container owns the loading and failure chrome. */
@Component({
  selector: 'app-spot-map',
  imports: [],
  templateUrl: './spot-map.component.html',
  styleUrl: './spot-map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotMapComponent {
  city = input.required<CityEnum>();

  /** Bumped by the container on RETRY; any change rebuilds the map from scratch. */
  retryToken = input.required<number>();

  ready = output<void>();
  failed = output<MapFailureReason>();

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
   * Latched the moment the map either paints or gives up, so one map can never report both
   * `ready` and `failed`. Every teardown resets it, because the next build is a new map.
   */
  private outcome: 'pending' | 'painted' | 'failed' = 'pending';

  /** The open popup, the component inside it and the pin it belongs to — one spot at a time. */
  private popup?: MapLibrePopup;
  private popupRef?: ComponentRef<SpotPopupComponent>;
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
    void this.loadElevation();

    let collection: SpotCollection;
    try {
      collection = await firstValueFrom(this.spots.loadSpots(city));
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

    map.on('sourcedata', (event) => {
      // No generation guard: the set belongs to this build, and only this build's own error
      // handler reads it.
      if (event.sourceDataType === 'metadata') {
        sourcesAwaitingMetadata.delete(event.sourceId);
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
      this.drawSpots(map, collection);
      this.ready.emit();
      // Only now: `load` waits on every visible source's tiles, so terrain in the opening style
      // would hold the pins back behind the slowest DEM tile.
      // A missing terrain library resolves `null` — the loader never rejects — and leaves the map
      // flat.
      void this.addElevation(map, this.loadElevation(), generation);
    });

    map.on('click', SPOT_HIT_LAYER_ID, (event: MapLayerMouseEvent) => {
      void this.openPopup(map, collection, event, generation);
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
   * Opens one popup for the tapped pin, carrying a {@link SpotPopupComponent}. The previous
   * selection is dropped first, so a tap while another popup is open replaces it instead of
   * leaving a second component alive on the map.
   */
  private async openPopup(
    map: MapLibreMap,
    collection: SpotCollection,
    event: MapLayerMouseEvent,
    generation: number,
  ): Promise<void> {
    // The rendered feature only carries the id; the loaded collection is where the typed spot —
    // photo list included — actually lives.
    const tappedId = event.features?.[0]?.id;
    const spot = collection.features.find(
      (feature) => feature.properties.id === String(tappedId),
    );
    if (!spot) {
      return;
    }

    this.clearSelection();
    const id = spot.properties.id;
    map.setFeatureState({ source: SPOT_SOURCE_ID, id }, { selected: true });
    this.selectedId = id;
    this.cancelLockOn = startLockOn(map, id, {
      reducedMotion: prefersReducedMotion(),
    });

    const content = createComponent(SpotPopupComponent, {
      environmentInjector: this.environment,
    });
    content.setInput('spot', spot);
    // Built outside any template, so its view has to be attached by hand: without that nothing
    // would ever re-render the gallery's photo after an arrow is pressed.
    this.applicationRef.attachView(content.hostView);
    content.changeDetectorRef.detectChanges();
    this.popupRef = content;

    let popup: MapLibrePopup;
    try {
      popup = await this.popupFactory({
        closeButton: true,
        maxWidth: POPUP_MAX_WIDTH,
        className: SPOT_POPUP_FRAME_CLASS,
      });
    } catch {
      // The popup's maplibre-gl chunk never arrived. Left alone this would show an amber pin
      // with nothing beside it, so the tap is unwound: the view released, the pin dropped.
      if (this.popupRef === content) {
        this.clearSelection();
      } else if (!content.hostView.destroyed) {
        content.destroy();
      }
      return;
    }
    if (generation !== this.generation || this.popupRef !== content) {
      // A teardown or a second tap overtook this popup while maplibre-gl was loading.
      popup.remove();
      if (!content.hostView.destroyed) {
        content.destroy();
      }
      return;
    }

    popup
      .setLngLat(spot.geometry.coordinates)
      .setDOMContent(content.location.nativeElement)
      .addTo(map);
    // MapLibre also closes on a tap on the map, and fires `close` either way. The identity check
    // keeps a closing popup from clearing a selection that already belongs to its successor.
    popup.on('close', () => {
      if (this.popup === popup) {
        this.clearSelection();
      }
    });
    this.popup = popup;
  }

  /**
   * Closes the open popup, destroys the component inside it, stops the lock-on pulse and drops the
   * pin's selected state. One popup is created per pin tap, so anything left behind here leaks on
   * every tap (QC6).
   */
  private clearSelection(): void {
    const popup = this.popup;
    this.popup = undefined;
    popup?.remove();

    const ref = this.popupRef;
    this.popupRef = undefined;
    if (ref && !ref.hostView.destroyed) {
      ref.destroy();
    }

    this.cancelLockOn?.();
    this.cancelLockOn = undefined;

    const id = this.selectedId;
    this.selectedId = undefined;
    if (id !== undefined) {
      this.map?.removeFeatureState({ source: SPOT_SOURCE_ID, id }, 'selected');
    }
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
    this.clearSelection();
    this.map?.remove();
    this.map = undefined;
    this.failed.emit(reason);
  }

  /** Adds the spot source and its pins, then frames the city's spots. */
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

    const bounds = this.boundsOf(collection);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: FIT_PADDING_PX,
        maxZoom: FIT_MAX_ZOOM,
        duration: prefersReducedMotion() ? 0 : FIT_DURATION_MS,
      });
    }
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

  /** The tightest box holding every spot, or null for a city whose set is still empty. */
  private boundsOf(
    collection: SpotCollection,
  ): [[number, number], [number, number]] | null {
    if (collection.features.length === 0) {
      return null;
    }
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const feature of collection.features) {
      const [lng, lat] = feature.geometry.coordinates;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
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
    this.outcome = 'pending';
    this.clearSelection();
    this.map?.remove();
    this.map = undefined;
  }
}
