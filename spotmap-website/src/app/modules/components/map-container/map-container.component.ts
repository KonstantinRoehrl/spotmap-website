import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum, MapFailureReason } from '../../../models/enums/map-enum';
import { GmapsEmbedComponent } from '../gmaps-embed/gmaps-embed.component';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';
import { SpotMapComponent } from '../spot-map/spot-map.component';

/** How long to wait for the renderer to report first paint before declaring the map unreachable. */
const LOAD_TIMEOUT_MS = 15_000;

/** Delay between the renderer reporting ready and revealing it (preserves the fade-in cadence). */
const REVEAL_DELAY_MS = 700;

@Component({
  selector: 'app-map-container',
  imports: [LoadingBarComponent, GmapsEmbedComponent, SpotMapComponent],
  templateUrl: './map-container.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map-container.component.css',
})
export class MapContainerComponent {
  city = input.required<CityEnum>();

  /** Which renderer draws the selected city. */
  protected readonly renderer = computed(
    () => SUPPORTED_CITIES[this.city()].renderer,
  );

  /** Bumped on each retry so the active renderer re-attempts from scratch. */
  protected readonly retryToken = signal(0);

  protected readonly failureReason = signal<MapFailureReason | null>(null);
  protected readonly mapReady = signal(false);

  private timeoutId?: number;
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

  private startTimer() {
    this.clearTimer();
    this.timeoutId = window.setTimeout(() => {
      if (!this.mapReady()) {
        this.failureReason.set('unreachable');
      }
    }, LOAD_TIMEOUT_MS);
  }

  private clearTimer() {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  private clearRevealTimer() {
    if (this.revealTimeoutId !== undefined) {
      clearTimeout(this.revealTimeoutId);
      this.revealTimeoutId = undefined;
    }
  }

  private clearAllTimers() {
    this.clearTimer();
    this.clearRevealTimer();
  }
}
