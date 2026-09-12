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
import type { CircleLayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { firstValueFrom } from 'rxjs';
import { CityEnum, MapFailureReason } from '../../../models/enums/map-enum';
import { SpotCollection } from '../../../models/spots/spot';
import { SpotsService } from '../../../services/spots.service';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { MAP_FACTORY } from './map-factory.token';
import {
  buildTerminalStyle,
  SPOT_BODY_LAYER_ID,
  SPOT_GLOW_LAYER_ID,
  SPOT_HIT_LAYER_ID,
  SPOT_SELECTED_LAYER_ID,
  SPOT_SOURCE_ID,
  TERMINAL_PALETTE,
} from './terminal-map-style';

/** Padding, in pixels, around the fitted spot bounds. */
const FIT_PADDING_PX = 48;

/** Never zoom past this when fitting a tight cluster — a 20-metre-wide view helps nobody. */
const FIT_MAX_ZOOM = 16;

/** How long the opening fit-to-spots camera move takes, unless reduced motion is requested. */
const FIT_DURATION_MS = 600;

/**
 * The spot pins, drawn in paint order. The hit layer comes first so its 22 px transparent
 * circle is the thumb target while the visible pin stays 6 px.
 */
const SPOT_LAYERS: CircleLayerSpecification[] = [
  {
    id: SPOT_HIT_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': 22,
      'circle-color': TERMINAL_PALETTE.bg,
      'circle-opacity': 0,
    },
  },
  {
    id: SPOT_GLOW_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': 14,
      'circle-blur': 1,
      'circle-color': TERMINAL_PALETTE.phosphor,
      'circle-opacity': [
        'case',
        ['==', ['get', 'status'], 'demolished'],
        0.15,
        0.5,
      ],
    },
  },
  {
    id: SPOT_BODY_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': 6,
      'circle-color': [
        'case',
        ['==', ['get', 'status'], 'demolished'],
        TERMINAL_PALETTE.phosphorDeep,
        TERMINAL_PALETTE.phosphor,
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': TERMINAL_PALETTE.bg,
    },
  },
  {
    id: SPOT_SELECTED_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': 11,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 2,
      'circle-stroke-color': TERMINAL_PALETTE.amber,
      'circle-stroke-opacity': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        1,
        0,
      ],
    },
  },
];

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

  private map?: MapLibreMap;

  /** Separates a fatal error before first paint from a single tile failing afterwards. */
  private loaded = false;

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
      this.failed.emit('unsupported');
      return;
    }

    let collection: SpotCollection;
    try {
      collection = await firstValueFrom(this.spots.loadSpots(city));
    } catch {
      this.failed.emit('unreachable');
      return;
    }
    if (generation !== this.generation) {
      return;
    }

    const map = await this.mapFactory({
      container: this.canvasHost().nativeElement,
      style: buildTerminalStyle(),
      // Attribution is a licence condition of the OSM-derived tiles, never optional.
      attributionControl: { compact: true },
    });
    if (generation !== this.generation) {
      map.remove();
      return;
    }
    this.map = map;

    // Rotation and pitch are off: a two-finger gesture may only pan and zoom.
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on('error', () => {
      // After first paint an error is a single tile or glyph failing, which the map survives.
      if (!this.loaded) {
        this.failed.emit('unreachable');
      }
    });

    map.on('load', () => {
      this.loaded = true;
      this.drawSpots(map, collection);
      this.ready.emit();
    });
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

  private hasWebGl(): boolean {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  }

  /** Releases the map's WebGL context — the browser caps how many may be alive at once. */
  private teardown(): void {
    this.generation += 1;
    this.loaded = false;
    this.map?.remove();
    this.map = undefined;
  }
}
