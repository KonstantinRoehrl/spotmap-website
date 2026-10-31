import { computed, DestroyRef, inject, Signal, signal } from '@angular/core';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import {
  clearColumnShare,
  columnWidthFor,
  readColumnShare,
  storeColumnShare,
} from '../../components/split-handle/column-split';

/**
 * How long the column eases back to its default width after a double-click on the split handle:
 * the sheet's and the camera's 330 ms, so the page's own resizes all move on one beat.
 */
export const COLUMN_RESET_EASE_MS = 330;

/**
 * The spot column's width on a wide screen: its remembered share of the window, or the default,
 * and the ease back to that default. Create it in an injection context, for its timer's cleanup.
 */
export class ColumnSplitState {
  /** The column's remembered share of the window, or `null` while it has its default width. */
  private readonly share = signal(readColumnShare());

  /** The writable side of {@link easing}. */
  private readonly easingState = signal(false);

  /** Ends the reset ease, just after the 330 ms the width takes. */
  private easeTimer?: ReturnType<typeof setTimeout>;

  /**
   * The column's width in px: its share of the window, or the default, held inside the handle's
   * limits. The share is what holds when the window is resized.
   */
  readonly width = computed(() =>
    columnWidthFor(this.share(), this.frameWidth()),
  );

  /** Set while the column eases back to its default width after the handle's reset. */
  readonly easing = this.easingState.asReadonly();

  constructor(private readonly frameWidth: Signal<number>) {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.easeTimer));
  }

  /**
   * The handle moved: the column takes the new width, held as its share of the window so a later
   * window size keeps the proportion. The handle has already clamped the width.
   */
  resize(width: number): void {
    const frameWidth = this.frameWidth();
    if (frameWidth <= 0) {
      return;
    }
    this.share.set(Math.min(width / frameWidth, 0.5));
  }

  /** The handle finished moving: the share is written now, not on every move of a drag. */
  persist(): void {
    const share = this.share();
    if (share !== null) {
      storeColumnShare(share);
    }
  }

  /**
   * The handle was double-clicked: the column goes back to its default width and the share is
   * forgotten. The width eases over {@link COLUMN_RESET_EASE_MS}; under reduced motion it changes at
   * once (the motion net would drop the width transition anyway, so no class is set there).
   */
  reset(): void {
    clearColumnShare();
    this.stopEase();
    if (!prefersReducedMotion()) {
      this.easingState.set(true);
      this.easeTimer = setTimeout(
        () => this.stopEase(),
        COLUMN_RESET_EASE_MS + 50,
      );
    }
    this.share.set(null);
  }

  /** Drops the reset ease and its timer, so a drag after it follows the pointer at once. */
  private stopEase(): void {
    clearTimeout(this.easeTimer);
    this.easeTimer = undefined;
    this.easingState.set(false);
  }
}
