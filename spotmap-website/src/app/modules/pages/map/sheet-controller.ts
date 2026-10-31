import { computed, effect, signal, untracked } from '@angular/core';
import {
  INITIAL_SHEET,
  nextSheet,
  SheetEvent,
  SheetModel,
} from '../../components/spot-sheet/spot-sheet-state';
import type { SelectionEvent, SpotBrowserStore } from './spot-browser.store';

/** What the sheet needs of the store. */
export type SheetStore = Pick<
  SpotBrowserStore,
  'selectedId' | 'selectionEvent' | 'notice' | 'close'
>;

/**
 * The sheet's height and where it returns to, for the layouts under 1024 px: what moves it, from
 * the store and from the sheet's own controls. Create it in an injection context, for its effects.
 * It feeds the sheet only; where focus goes when a spot closes is the page's.
 */
export class SheetController {
  private readonly model = signal<SheetModel>(INITIAL_SHEET);

  /**
   * Set while the sheet's own back or close is closing the spot, so the route change that follows
   * does not also move the sheet back to its resting height. Cleared when a spot is open again,
   * so a close that never reached the route cannot swallow a later one.
   */
  private closingFromSheet = false;

  /** The sheet's height. */
  readonly state = computed(() => this.model().state);

  constructor(private readonly store: SheetStore) {
    // A cold link's first id raises no event, so the sheet starts open for it.
    if (store.selectedId() !== null) {
      this.feed('opened');
    }

    effect(() => {
      const event = store.selectionEvent();
      if (event !== null) {
        untracked(() => this.onSelectionEvent(event));
      }
    });

    effect(() => {
      if (store.notice() === 'not-found') {
        untracked(() => this.feed('not-found'));
      }
    });
  }

  /** A tap on the sheet's head. */
  headTap(): void {
    this.feed('head');
  }

  /** The sheet's < OVERVIEW plate: back to the list, closing the spot. */
  back(): void {
    this.feed('back');
    this.closeSpot();
  }

  /** The sheet's `✕`: down to the peek bar, closing the spot. */
  close(): void {
    this.feed('close');
    this.closeSpot();
  }

  /** A tap on the map that missed every pin closes an open spot, down to the peek bar. */
  mapTap(): void {
    if (this.store.selectedId() === null) {
      return;
    }
    this.feed('map-tap');
    this.closeSpot();
  }

  /** Moves the sheet for a change of the open spot. */
  private onSelectionEvent({ kind }: SelectionEvent): void {
    if (kind === 'closed') {
      if (!this.closingFromSheet) {
        this.feed('closed-elsewhere');
      }
    } else if (kind === 'opened') {
      this.feed('opened');
    }
    this.closingFromSheet = false;
  }

  /** Moves the sheet by one event of its state machine. */
  private feed(event: SheetEvent): void {
    this.model.update((model) => nextSheet(model, event));
  }

  /** Closes the open spot on the sheet's behalf. */
  private closeSpot(): void {
    if (this.store.selectedId() === null) {
      return;
    }
    this.closingFromSheet = true;
    this.store.close();
  }
}
