import {
  afterNextRender,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CityEnum } from '../../../models/enums/map-enum';
import {
  NO_INSETS,
  type AttributionCorner,
  type MapFocus,
  type MapInsets,
  type SelectionFraming,
} from '../../../models/map/map-camera';
import { SpotListCollection } from '../../../models/spots/spot';
import type { ViewBounds } from '../../../models/spots/spots-in-view';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { MapLoaderComponent } from '../map-loader/map-loader.component';
import { SpotMapComponent } from '../spot-map/spot-map.component';
import {
  INITIAL_MAP_LOAD_STATE,
  MapLoadProgress,
  MapLoadState,
} from './map-load-progress';
import type { MapFailureReason } from '../../../models/map/map-failure-reason';
import type { MapLoadEvent } from '../../../models/map/map-load-event';

/**
 * How long a load may run before the watchdog steps in: it reveals a map that has painted, and
 * declares one that has not unreachable.
 */
export const LOAD_TIMEOUT_MS = 15_000;

/** A city slug as a reader would write it: `vienna` → `Vienna`. */
function cityName(city: string): string {
  return city.charAt(0).toUpperCase() + city.slice(1);
}

/**
 * Hosts the city's MapLibre map and owns its loading progress, watchdog, failure and retry state;
 * the map renders for every city. The loader shows the map's real load events and reveals the map
 * once its bar has finished.
 */
@Component({
  selector: 'app-map-container',
  imports: [MapLoaderComponent, PointerBloomDirective, SpotMapComponent],
  templateUrl: './map-container.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map-container.component.css',
})
export class MapContainerComponent {
  /** The city whose map is shown; the instance is reused when it changes. */
  city = input.required<CityEnum>();

  /** The spot the URL has open, handed to the map; see `SpotMapComponent.selectedId`. */
  selectedId = input<string | null>(null);
  /** The strips the page's UI covers, handed to the map; see `SpotMapComponent.coveredInsets`. */
  coveredInsets = input<MapInsets>(NO_INSETS);
  /** How the map keeps the selected pin in view; see `SpotMapComponent.selectionFraming`. */
  selectionFraming = input<SelectionFraming>('reveal');
  /** Where the next build opens; see `SpotMapComponent.openOn`. */
  openOn = input<MapFocus | null>(null);
  /** The attribution's corner; see `SpotMapComponent.attributionCorner`. */
  attributionCorner = input<AttributionCorner>('bottom-right');
  /** The spot a pointer or list row hovers, handed to the map; see `SpotMapComponent.hoveredId`. */
  hoveredId = input<string | null>(null);

  /** The pin under a hovering pointer, re-emitted from `SpotMapComponent.pinHover`. */
  pinHover = output<string | null>();
  /** The map's spots in the list shape, re-emitted from `SpotMapComponent.spotsLoaded`. */
  spotsLoaded = output<SpotListCollection>();
  /** A pin tap, re-emitted from `SpotMapComponent.spotClick`. */
  spotClick = output<string>();
  /** A tap on empty map, re-emitted from `SpotMapComponent.emptyClick`. */
  emptyClick = output<void>();
  /** The uncovered part of the map's bounds, re-emitted from `SpotMapComponent.boundsChange`. */
  boundsChange = output<ViewBounds>();

  /** Bumped on each retry so the active renderer re-attempts from scratch. */
  protected readonly retryToken = signal(0);

  /** Why the map gave up, or `null` while it is loading or shown; non-null shows the error overlay. */
  protected readonly failureReason = signal<MapFailureReason | null>(null);
  /** Whether the map has been revealed; false shows the loader. */
  protected readonly mapReady = signal(false);
  /** The current load's step and progress, as the loader draws it. */
  protected readonly loadState = signal<MapLoadState>(INITIAL_MAP_LOAD_STATE);

  /** One polite line naming the step, for screen readers; empty once the map shows or has failed. */
  protected readonly statusText = computed(() => {
    if (this.mapReady() || this.failureReason() !== null) {
      return '';
    }
    const city = cityName(this.city());
    const { step, fallback } = this.loadState();
    if (step === 'spots') {
      return fallback
        ? `Using the archive copy for ${city}`
        : `Loading spots for ${city}`;
    }
    return step === 'map' ? `Loading the map of ${city}` : 'Drawing the map';
  });
  /** Whether the status region has been on screen for a frame, so that what it receives is announced. */
  private readonly statusRegionRendered = signal(false);
  /**
   * What the status region holds: nothing until it has been painted empty, then {@link statusText}.
   * Assistive technology announces changes to a live region but not the text it was inserted with,
   * and the browser builds its accessibility tree once per frame, so the first message waits one
   * animation frame after the region renders. This defers only the announcement: nothing in the
   * load waits on it, and neither the progress nor the reveal reads it.
   */
  protected readonly announcement = computed(() =>
    this.statusRegionRendered() ? this.statusText() : '',
  );

  /** Folds the current load's events into {@link loadState}; replaced for every new load. */
  private progress = new MapLoadProgress();
  /** Whether the current load's map has painted, which makes the watchdog reveal rather than fail. */
  private painted = false;
  /** The pending watchdog, if armed. */
  private timeoutId?: number;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.clearTimer());
    this.startTimer();
    afterNextRender(() => {
      const frame = requestAnimationFrame(() =>
        this.statusRegionRendered.set(true),
      );
      destroyRef.onDestroy(() => cancelAnimationFrame(frame));
    });

    // The component instance is reused across dropdown selections (only the
    // `city` input changes, the component is not recreated). Reset the load on
    // every city change AFTER the first, so a newly selected map shows the
    // loader again from zero instead of a stale "loaded" frame, and gets its own
    // watchdog — without it, a hung/failed new city never surfaces SIGNAL LOST/RETRY.
    // The first run (initial city) is skipped: the constructor armed it above.
    let firstCity = true;
    effect(() => {
      this.city(); // track the input
      if (firstCity) {
        firstCity = false;
        return;
      }
      this.resetLoad();
      this.retryToken.set(0);
    });
  }

  /** A real loading event from the map; advances the loader. Ignored while a failure is shown. */
  protected onLoadEvent(event: MapLoadEvent): void {
    if (this.failureReason() !== null) {
      return;
    }
    if (event.kind === 'painted') {
      this.painted = true;
    }
    this.loadState.set(this.progress.apply(event));
  }

  /** The map has drawn its pins; the loader's bar runs to 100 %. */
  protected onRendererReady(): void {
    this.onLoadEvent({ kind: 'pins-drawn' });
  }

  /** The loader's bar has finished its ease to 100 %: the cue to reveal the map. */
  protected onBarFinished(): void {
    this.reveal();
  }

  /** A renderer gave up. `unsupported` is terminal — the template withholds RETRY for it. */
  protected onRendererFailed(reason: MapFailureReason): void {
    this.clearTimer();
    this.mapReady.set(false);
    this.failureReason.set(reason);
  }

  /** Re-attempt the map: reset the load, restart the watchdog, and re-arm the renderer. */
  retry() {
    this.resetLoad();
    this.retryToken.update((n) => n + 1);
  }

  /** Show the map and end the load: the watchdog stands down and any failure clears. */
  private reveal(): void {
    this.clearTimer();
    this.failureReason.set(null);
    this.mapReady.set(true);
  }

  /** Start a fresh load: progress from zero, nothing painted, loader shown, watchdog re-armed. */
  private resetLoad(): void {
    this.clearTimer();
    this.progress = new MapLoadProgress();
    this.loadState.set(INITIAL_MAP_LOAD_STATE);
    this.painted = false;
    this.mapReady.set(false);
    this.failureReason.set(null);
    this.startTimer();
  }

  /**
   * Arm the watchdog. When it fires, a painted map is revealed — it is the backstop for a bar
   * that never reports finishing — and a map that never painted is declared unreachable.
   */
  private startTimer() {
    this.clearTimer();
    this.timeoutId = window.setTimeout(() => {
      this.timeoutId = undefined;
      if (this.painted) {
        this.reveal();
      } else {
        this.failureReason.set('unreachable');
      }
    }, LOAD_TIMEOUT_MS);
  }

  /** Cancel the watchdog. */
  private clearTimer() {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }
}
