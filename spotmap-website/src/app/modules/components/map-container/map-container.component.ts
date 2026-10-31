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
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CityEnum } from '../../../models/enums/map-enum';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { MapLoaderComponent } from '../map-loader/map-loader.component';
import { MapLoadProgress } from '../map-loader/map-load-progress';
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
 * Frames the map the page projects into it and owns its loading progress, watchdog, failure and
 * retry state. The loader shows the real load events, the store's and the map's, and the frame
 * reveals the map once the bar has finished.
 */
@Component({
  selector: 'app-map-container',
  imports: [MapLoaderComponent, PointerBloomDirective],
  templateUrl: './map-container.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map-container.component.css',
})
export class MapContainerComponent {
  /** The city being loaded; the instance is reused when it changes. */
  city = input.required<CityEnum>();
  /** The list load's milestones so far, as the store logs them. */
  spotEvents = input<readonly MapLoadEvent[]>([]);
  /** The list load ended with no usable list, so no map will come. */
  listFailed = input(false);

  /** The visitor asked for RETRY; the frame has already reset its own load. */
  retry = output<void>();

  /** The current load's events from the map; the store's come through {@link spotEvents}. */
  private readonly mapEvents = signal<readonly MapLoadEvent[]>([]);
  /** Why the map gave up, or the watchdog did for it; `null` while it is loading or shown. */
  private readonly mapFailure = signal<MapFailureReason | null>(null);

  /** Why there is no map, or `null` while it is loading or shown; non-null shows the error overlay. */
  protected readonly failureReason = computed(
    () => this.mapFailure() ?? (this.listFailed() ? 'unreachable' : null),
  );
  /** Whether the map has been revealed; false shows the loader. */
  protected readonly mapReady = signal(false);
  /** The current load's step and progress, as the loader draws it. */
  protected readonly loadState = computed(() => {
    const progress = new MapLoadProgress();
    for (const event of [...this.spotEvents(), ...this.mapEvents()]) {
      progress.apply(event);
    }
    return progress.state;
  });

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
    });

    // A failed list means no build will ever report, so the watchdog has nothing to wait for.
    effect(() => {
      if (this.listFailed()) {
        untracked(() => this.clearTimer());
      }
    });
  }

  /** A real loading event from the map; advances the loader. Ignored while a failure is shown. */
  report(event: MapLoadEvent): void {
    if (this.failureReason() !== null) {
      return;
    }
    if (event.kind === 'painted') {
      this.painted = true;
    }
    this.mapEvents.update((events) => [...events, event]);
  }

  /** The map has drawn its pins; the loader's bar runs to 100 %. */
  onReady(): void {
    this.report({ kind: 'pins-drawn' });
  }

  /** The loader's bar has finished its ease to 100 %: the cue to reveal the map. */
  protected onBarFinished(): void {
    this.reveal();
  }

  /** The map gave up. `unsupported` is terminal: the template withholds RETRY for it. */
  onFailed(reason: MapFailureReason): void {
    this.clearTimer();
    this.mapReady.set(false);
    this.mapFailure.set(reason);
  }

  /** RETRY: resets this frame's load and asks the page to load the list and rebuild the map. */
  protected onRetryClick(): void {
    this.resetLoad();
    this.retry.emit();
  }

  /** Show the map and end the load: the watchdog stands down and any failure clears. */
  private reveal(): void {
    this.clearTimer();
    this.mapFailure.set(null);
    this.mapReady.set(true);
  }

  /** Start a fresh load: progress from zero, nothing painted, loader shown, watchdog re-armed. */
  private resetLoad(): void {
    this.clearTimer();
    this.mapEvents.set([]);
    this.painted = false;
    this.mapReady.set(false);
    this.mapFailure.set(null);
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
        this.mapFailure.set('unreachable');
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
