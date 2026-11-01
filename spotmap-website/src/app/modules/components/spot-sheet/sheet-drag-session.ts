import { NgZone } from '@angular/core';
import {
  clampHeight,
  DragSample,
  releaseVelocity,
  riseAt,
  settleStop,
  SHEET_DRAG_SLOP_PX,
} from './sheet-drag';
import { SheetStop, SheetStops } from './spot-sheet-state';

/** What a drag tells the sheet. */
export interface SheetDragEvents {
  /** The drag has begun: the one change detection a drag causes, with `settled`. */
  started(): void;
  /** The drag came to rest at `stop`. */
  settled(stop: SheetStop): void;
  /**
   * The new height is on its way. Call `clearHeldGeometry` when the sheet should take it: at once
   * normally, or halfway through the reduced-motion crossfade.
   */
  release(clearHeldGeometry: () => void): void;
}

/** The plates in the head, which keep their own presses. */
const HEAD_PLATES = 'app-overview-back, .spot-sheet__close';

/**
 * One drag of the sheet, from either the head's pointer or the body's touch. It writes its height and
 * rise to custom properties the host's styles fall back from, rather than to the height the page binds.
 * Angular would not rewrite an unchanged binding, so a drag that eases back could never clear itself.
 */
export class SheetDrag {
  private start: { readonly y: number; readonly height: number } | null = null;
  private samples: DragSample[] = [];
  private height = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly stops: () => SheetStops,
    private readonly events: SheetDragEvents,
  ) {}

  /** Whether a drag is under way. */
  get active(): boolean {
    return this.start !== null;
  }

  /** Starts following at `y`, from the height the sheet is rendered at now, mid-settle or not. */
  begin(y: number): void {
    const height = this.host.getBoundingClientRect().height;
    this.start = { y, height };
    this.samples = [];
    this.write(height);
    this.events.started();
  }

  /** Follows the finger to `y`, 1:1, within the sheet's travel. */
  move(y: number, t: number): void {
    if (!this.start) {
      return;
    }
    this.samples.push({ y, t });
    this.write(clampHeight(this.start.height + this.start.y - y, this.stops()));
  }

  /** Ends the drag. A cancelled one has no speed, so it settles like a slow release. */
  end(t: number, cancelled: boolean): void {
    if (!this.start) {
      return;
    }
    this.start = null;
    const velocity = cancelled ? 0 : releaseVelocity(this.samples, t);
    this.events.settled(settleStop(this.height, velocity, this.stops()));
    this.events.release(() => this.clear());
  }

  /** Holds the sheet at `height` with no drag under way, until the returned function lets go. */
  hold(height: number): () => void {
    this.write(height);
    return () => this.clear();
  }

  /** Holds the sheet at `height`; `clear` lets go. */
  private write(height: number): void {
    this.height = height;
    this.host.style.setProperty('--sheet-drag-height', `${height}px`);
    this.host.style.setProperty(
      '--sheet-drag-rise',
      String(riseAt(height, this.stops())),
    );
  }

  /** Hands the sheet's geometry back to its bound values, which it eases to. */
  private clear(): void {
    this.host.style.removeProperty('--sheet-drag-height');
    this.host.style.removeProperty('--sheet-drag-rise');
  }
}

/**
 * Drags the sheet from its head, plates excepted, for any pointer type. A press past
 * {@link SHEET_DRAG_SLOP_PX} of vertical travel becomes a drag, captured on the head like the split
 * handle's. Under that it stays a tap. Moves are listened for on the document during a press only and
 * outside the zone, so a mouse leaving the head within the slop still counts. Returns its detacher.
 */
export function attachHeadDrag(
  head: HTMLElement,
  drag: SheetDrag,
  zone: NgZone,
): () => void {
  const doc = head.ownerDocument;
  let press: { readonly id: number; readonly y: number } | null = null;
  let clickGuard: ReturnType<typeof setTimeout> | undefined;

  /** A release can still raise a click on the control the press began on. It must not fire. */
  const swallowClick = (event: MouseEvent): void => {
    event.stopPropagation();
    event.preventDefault();
  };

  /** A native drag starting anywhere would cancel the pointer. */
  const cancelNativeDrag = (event: DragEvent): void => event.preventDefault();

  const stopListening = (): void => {
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onEnd);
    doc.removeEventListener('pointercancel', onEnd);
    doc.removeEventListener('dragstart', cancelNativeDrag, true);
  };

  const onMove = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.id) {
      return;
    }
    if (!drag.active) {
      if (Math.abs(event.clientY - press.y) < SHEET_DRAG_SLOP_PX) {
        return;
      }
      head.setPointerCapture(press.id);
      head.addEventListener('click', swallowClick, true);
      drag.begin(event.clientY);
      return;
    }
    drag.move(event.clientY, event.timeStamp);
  };

  const onEnd = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.id) {
      return;
    }
    press = null;
    stopListening();
    if (drag.active) {
      drag.end(event.timeStamp, event.type === 'pointercancel');
      clickGuard = setTimeout(() =>
        head.removeEventListener('click', swallowClick, true),
      );
    }
  };

  const onDown = (event: PointerEvent): void => {
    if (
      press ||
      event.button !== 0 ||
      !event.isPrimary ||
      (event.target as Element).closest(HEAD_PLATES)
    ) {
      return;
    }
    press = { id: event.pointerId, y: event.clientY };
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onEnd);
    doc.addEventListener('pointercancel', onEnd);
    doc.addEventListener('dragstart', cancelNativeDrag, true);
  };

  zone.runOutsideAngular(() => head.addEventListener('pointerdown', onDown));

  return () => {
    clearTimeout(clickGuard);
    stopListening();
    head.removeEventListener('pointerdown', onDown);
    head.removeEventListener('click', swallowClick, true);
  };
}
