import { Component, computed, DestroyRef, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum } from '../../../models/enums/map-enum';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';

/** How long to wait for the iframe `load` event before declaring the map unreachable. */
const LOAD_TIMEOUT_MS = 15_000;

/** Delay between the iframe reporting `load` and revealing it (preserves the fade-in cadence). */
const REVEAL_DELAY_MS = 700;

@Component({
    selector: 'app-map-container',
    imports: [LoadingBarComponent],
    templateUrl: './map-container.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './map-container.component.css'
})
export class MapContainerComponent {
  city = input.required<CityEnum>();

  /** Bumped on each retry to cache-bust the embed src and force a fresh fetch. */
  private readonly reloadNonce = signal(0);

  readonly safeUrl = computed<SafeResourceUrl>(() => {
    const base = SUPPORTED_CITIES[this.city()].mapLink;
    const nonce = this.reloadNonce();
    // Preserve the exact original URL on first load; append a cache-buster only on retry.
    const url = nonce === 0 ? base : `${base}&_r=${nonce}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected iframeLoaded = signal(false);
  protected loadError = signal(false);

  private timeoutId?: number;
  private revealTimeoutId?: number;

  constructor(private sanitizer: DomSanitizer) {
    inject(DestroyRef).onDestroy(() => this.clearAllTimers());
    this.startTimer();
  }

  onIframeLoad() {
    // Cancel the unreachable-timeout the instant load fires, so a slow-but-successful
    // load in the final window before LOAD_TIMEOUT_MS can't flash "SIGNAL LOST".
    this.clearTimer();
    // Guard against a stacked reveal if `load` somehow fires twice before the reveal lands.
    this.clearRevealTimer();
    // Preserve the existing fade-in cadence: reveal shortly after the embed reports ready.
    // Tracked so retry()/error/destroy can cancel it — otherwise a stale reveal from a
    // pre-retry navigation could flip iframeLoaded=true over unloaded content.
    this.revealTimeoutId = window.setTimeout(() => {
      this.revealTimeoutId = undefined;
      this.loadError.set(false);
      this.iframeLoaded.set(true);
    }, REVEAL_DELAY_MS);
  }

  onIframeError() {
    this.clearAllTimers();
    this.iframeLoaded.set(false);
    this.loadError.set(true);
  }

  /** Re-attempt the embed: reset state, restart the timer, and re-point the iframe. */
  retry() {
    this.clearAllTimers();
    this.iframeLoaded.set(false);
    this.loadError.set(false);
    this.reloadNonce.update(n => n + 1);
    this.startTimer();
  }

  private startTimer() {
    this.clearTimer();
    this.timeoutId = window.setTimeout(() => {
      if (!this.iframeLoaded()) {
        this.loadError.set(true);
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
