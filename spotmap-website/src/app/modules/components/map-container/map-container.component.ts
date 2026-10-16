import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CityEnum, MapFailureReason } from '../../../models/enums/map-enum';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';
import { SpotMapComponent } from '../spot-map/spot-map.component';

/** How long to wait for the renderer to report first paint before declaring the map unreachable. */
const LOAD_TIMEOUT_MS = 15_000;

/** Delay between the renderer reporting ready and revealing it (preserves the fade-in cadence). */
const REVEAL_DELAY_MS = 700;

/**
 * Hosts the city's MapLibre map and owns its loading, timeout, failure and retry state; the map
 * renders for every city.
 */
@Component({
  selector: 'app-map-container',
  imports: [LoadingBarComponent, SpotMapComponent],
  templateUrl: './map-container.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map-container.component.css',
})
export class MapContainerComponent {
  /** The city whose map is shown; the instance is reused when it changes. */
  city = input.required<CityEnum>();

  /** Bumped on each retry so the active renderer re-attempts from scratch. */
  protected readonly retryToken = signal(0);

  /** Why the map gave up, or `null` while it is loading or shown; non-null shows the error overlay. */
  protected readonly failureReason = signal<MapFailureReason | null>(null);
  /** Whether the map has painted and been revealed; false shows the loading overlay. */
  protected readonly mapReady = signal(false);

  /** The pending unreachable-watchdog, if armed. */
  private timeoutId?: number;
  /** The pending fade-in reveal, if scheduled. */
  private revealTimeoutId?: number;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearAllTimers());
    this.startTimer();

    // The component instance is reused across dropdown selections (only the
    // `city` input changes, the component is not recreated). Re-arm the
    // reveal/error/timeout state machine on every city change AFTER the first,
    // so a newly selected map shows the loading overlay again instead of a
    // stale "loaded" frame (no white flash) and gets its own watchdog — without
    // it, switching cities after a successful load leaves mapReady=true and
    // no timeout, so a hung/failed new city never surfaces SIGNAL LOST/RETRY.
    // The first run (initial city) is skipped: the constructor armed it above.
    let firstCity = true;
    effect(() => {
      this.city(); // track the input
      if (firstCity) {
        firstCity = false;
        return;
      }
      this.resetForNewCity();
    });
  }

  /** Reset the reveal/error/timeout state machine for a freshly selected city. */
  private resetForNewCity() {
    this.clearAllTimers();
    this.mapReady.set(false);
    this.failureReason.set(null);
    this.retryToken.set(0);
    this.startTimer();
  }

  /** A renderer reported first paint. */
  protected onRendererReady(): void {
    // Cancel the unreachable-timeout the instant the renderer reports ready, so a
    // slow-but-successful load in the final window before LOAD_TIMEOUT_MS can't
    // flash "SIGNAL LOST".
    this.clearTimer();
    // Guard against a stacked reveal if `ready` somehow fires twice before the reveal lands.
    this.clearRevealTimer();
    // Preserve the existing fade-in cadence: reveal shortly after the renderer reports ready.
    // Tracked so retry()/failure/destroy can cancel it — otherwise a stale reveal from a
    // pre-retry navigation could flip mapReady=true over unloaded content.
    this.revealTimeoutId = window.setTimeout(() => {
      this.revealTimeoutId = undefined;
      this.failureReason.set(null);
      this.mapReady.set(true);
    }, REVEAL_DELAY_MS);
  }

  /** A renderer gave up. `unsupported` is terminal — the template withholds RETRY for it. */
  protected onRendererFailed(reason: MapFailureReason): void {
    this.clearAllTimers();
    this.mapReady.set(false);
    this.failureReason.set(reason);
  }

  /** Re-attempt the map: reset state, restart the timer, and re-arm the renderer. */
  retry() {
    this.clearAllTimers();
    this.mapReady.set(false);
    this.failureReason.set(null);
    this.retryToken.update((n) => n + 1);
    this.startTimer();
  }

  /** Arm the unreachable-watchdog: if the map has not revealed by LOAD_TIMEOUT_MS, show SIGNAL LOST. */
  private startTimer() {
    this.clearTimer();
    this.timeoutId = window.setTimeout(() => {
      if (!this.mapReady()) {
        this.failureReason.set('unreachable');
      }
    }, LOAD_TIMEOUT_MS);
  }

  /** Cancel the unreachable-watchdog. */
  private clearTimer() {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  /** Cancel the pending fade-in reveal. */
  private clearRevealTimer() {
    if (this.revealTimeoutId !== undefined) {
      clearTimeout(this.revealTimeoutId);
      this.revealTimeoutId = undefined;
    }
  }

  /** Cancel both the watchdog and the reveal. */
  private clearAllTimers() {
    this.clearTimer();
    this.clearRevealTimer();
  }
}
