import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LngLat } from '../../../../models/admin/admin-spot';
import {
  buildImageryStyle,
  IMAGERY_CONFIG,
  IMAGERY_SOURCE_ID,
} from '../../../../services/admin/imagery';
import { prefersReducedMotion } from '../../../../utils/prefers-reduced-motion';
import { PointerBloomDirective } from '../../../directives/pointer-bloom.directive';
import { MAP_FACTORY } from '../../spot-map/map-factory.token';

/** Opening zoom on a photo's GPS guess: close enough to tell a ledge from a curb. */
export const PICKER_DETAIL_ZOOM = 18;

/** Opening zoom on a city centre: a few streets across, to find the spot before zooming in. */
export const PICKER_CITY_ZOOM = 14;

/**
 * How far the maintainer may zoom in. Esri's imagery stops at z19; MapLibre overzooms the last
 * level beyond that, which is coarse but still the finest placement aid there is.
 */
export const PICKER_MAX_ZOOM = 21;

/** How long a `centre` change eases the camera when motion is allowed. */
const RECENTRE_DURATION_MS = 400;

/** Why the picker has no map: no WebGL 2 at all, or a build that failed and may work again. */
type PickerFailure = 'unsupported' | 'failed';

/**
 * The satellite pin picker: a MapLibre map of raster imagery with a pin fixed at its centre. The
 * maintainer pans the imagery under the pin (one-handed, no drag precision needed) and the map
 * centre is the picked position, emitted once the map loads and after every move.
 */
@Component({
  selector: 'app-satellite-picker',
  imports: [PointerBloomDirective],
  templateUrl: './satellite-picker.component.html',
  styleUrl: './satellite-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SatellitePickerComponent {
  /** Where the view opens; a later change eases there (jumps under reduced motion). */
  readonly centre = input.required<LngLat>();
  /** The opening zoom, re-applied with every later `centre` change. */
  readonly zoom = input<number>(PICKER_DETAIL_ZOOM);
  /** The imagery access token; a change after creation re-applies the style with the new one. */
  readonly token = input<string | null>(null);
  /** The map centre under the fixed pin, on load and every `moveend`. */
  readonly position = output<LngLat>();

  private readonly mapHost =
    viewChild.required<ElementRef<HTMLDivElement>>('mapHost');
  private readonly mapFactory = inject(MAP_FACTORY);
  private readonly config = inject(IMAGERY_CONFIG);

  /** The live map; a signal so the camera and token effects run once it exists. */
  private readonly map = signal<MapLibreMap | undefined>(undefined);
  /** The centre and zoom the camera was last sent to, so an equal input value moves nothing. */
  private applied?: { centre: LngLat; zoom: number };
  /** The token the current style was built with. */
  private appliedToken: string | null = null;
  /** Bumped by every teardown; a build resolving against a stale one throws its map away. */
  private generation = 0;

  /** The last position emitted, shown in the readout plate over the map. */
  protected readonly picked = signal<LngLat | null>(null);
  /** Why there is no map, or null while one is building or live. */
  protected readonly failure = signal<PickerFailure | null>(null);
  /** An imagery tile failed (a rejected key, no network); a later tile that loads clears it. */
  protected readonly tileError = signal(false);
  /** The provider needs a key and none reached the picker, so the imagery stays blank. */
  protected readonly missingToken = computed(
    () => this.config.tokenSetting !== null && this.token() === null,
  );
  /**
   * The live readout line: the picked position as `Pin at lat, lng` with 6 decimals (about 0.1 m),
   * or a waiting line that stands on its own until the map has reported a position.
   */
  protected readonly readout = computed(() => {
    const picked = this.picked();
    return picked === null
      ? 'Waiting for the map…'
      : `Pin at ${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.teardown());
    afterNextRender(() => void this.build());

    effect(() => {
      const map = this.map();
      const centre = this.centre();
      const zoom = this.zoom();
      if (map === undefined || this.sameView(centre, zoom)) {
        return;
      }
      this.applied = { centre, zoom };
      const view = {
        center: [centre.lng, centre.lat] as [number, number],
        zoom,
      };
      if (prefersReducedMotion()) {
        map.jumpTo(view);
      } else {
        map.easeTo({ ...view, duration: RECENTRE_DURATION_MS });
      }
    });

    effect(() => {
      const map = this.map();
      const token = this.token();
      if (map === undefined || token === this.appliedToken) {
        return;
      }
      this.appliedToken = token;
      this.tileError.set(false);
      map.setStyle(buildImageryStyle(this.config, token));
    });
  }

  /** Zooms the imagery one level in, instantly under reduced motion. */
  protected zoomIn(): void {
    this.map()?.zoomIn(prefersReducedMotion() ? { duration: 0 } : undefined);
  }

  /** Zooms the imagery one level out, instantly under reduced motion. */
  protected zoomOut(): void {
    this.map()?.zoomOut(prefersReducedMotion() ? { duration: 0 } : undefined);
  }

  /** Builds the map again after a failed build. */
  protected retry(): void {
    this.teardown();
    void this.build();
  }

  /** Probes WebGL 2, then builds the map on the current inputs and wires its events. */
  private async build(): Promise<void> {
    const generation = this.generation;
    this.failure.set(null);
    if (!hasWebGl2()) {
      this.failure.set('unsupported');
      return;
    }
    const centre = this.centre();
    const zoom = this.zoom();
    const token = this.token();
    let map: MapLibreMap;
    try {
      map = await this.mapFactory({
        container: this.mapHost().nativeElement,
        style: buildImageryStyle(this.config, token),
        center: [centre.lng, centre.lat],
        zoom,
        maxZoom: PICKER_MAX_ZOOM,
        // The picker stays flat and north-up: a turned or tilted view only makes placing harder.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // The imagery's attribution is a licence condition, never optional.
        attributionControl: { compact: true },
      });
    } catch (error) {
      // The lazy maplibre-gl chunk never arrived, or the GPU refused a context: worth a retry.
      console.error(error);
      if (generation === this.generation) {
        this.failure.set('failed');
      }
      return;
    }
    if (generation !== this.generation) {
      map.remove();
      return;
    }
    // The options above cannot reach the two-finger twist or Shift+Arrow rotation.
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    const report = () => {
      const { lng, lat } = map.getCenter();
      this.picked.set({ lng, lat });
      this.position.emit({ lng, lat });
    };
    map.on('load', report);
    map.on('moveend', report);
    map.on('error', (event) => {
      console.error(event.error);
      if ((event as { sourceId?: string }).sourceId === IMAGERY_SOURCE_ID) {
        this.tileError.set(true);
      }
    });
    map.on('sourcedata', (event) => {
      if (event.sourceId === IMAGERY_SOURCE_ID && event.tile !== undefined) {
        this.tileError.set(false);
      }
    });
    this.applied = { centre, zoom };
    this.appliedToken = token;
    this.map.set(map);
  }

  /** Whether the camera already shows this centre and zoom. */
  private sameView(centre: LngLat, zoom: number): boolean {
    const applied = this.applied;
    return (
      applied !== undefined &&
      applied.zoom === zoom &&
      applied.centre.lng === centre.lng &&
      applied.centre.lat === centre.lat
    );
  }

  /** Releases the map's WebGL context — the browser caps how many may be alive at once. */
  private teardown(): void {
    this.generation += 1;
    this.map()?.remove();
    this.map.set(undefined);
    this.applied = undefined;
  }
}

/**
 * Whether the browser hands out the WebGL 2 context MapLibre needs — the same probe as
 * `SpotMapComponent`'s (private there), whose own context is released at once.
 */
function hasWebGl2(): boolean {
  const context = document.createElement('canvas').getContext('webgl2');
  context?.getExtension('WEBGL_lose_context')?.loseContext();
  return !!context;
}
