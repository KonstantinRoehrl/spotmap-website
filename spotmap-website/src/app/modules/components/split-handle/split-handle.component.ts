import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
} from '@angular/core';
import {
  clampColumnWidth,
  COLUMN_BIG_STEP_PX,
  COLUMN_STEP_PX,
  maxColumnWidth,
  MIN_COLUMN_WIDTH_PX,
} from './column-split';

/** A drag under way: the pointer it follows, and where the pointer and the column started. */
interface Drag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
}

/** A frame width's share of `width`, in whole percent; 0 before the frame has been measured. */
function percentOf(width: number, frameWidth: number): number {
  return frameWidth > 0 ? Math.round((width / frameWidth) * 100) : 0;
}

/**
 * The wide layout's handle between the map and the spot column: a hairline with a grip, in a 16
 * px target. It follows the WAI-ARIA window-splitter pattern: a focusable vertical separator whose
 * value is the column's share of the frame. Dragging moves the column by what the pointer moves.
 * ← widens it and → narrows it (16 px, 64 px with Shift), Home and End go to its minimum and
 * maximum, and a double-click asks for the default width. It is presentational: it reports
 * clamped widths and the reset, and the page applies and remembers them (`column-split.ts`).
 *
 * A drag captures its pointer on the host, so every move and the release reach the handle
 * wherever the pointer goes. Moves are listened for only during a drag, outside the zone, and
 * re-enter it when they change the width. The page persists on
 * {@link SplitHandleComponent.widthCommit}, not on each move.
 */
@Component({
  selector: 'app-split-handle',
  templateUrl: './split-handle.component.html',
  styleUrl: './split-handle.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    'aria-label': 'Resize map and spot column',
    'aria-valuemax': '50',
    '[attr.aria-valuenow]': 'valueNow()',
    '[attr.aria-valuemin]': 'valueMin()',
    '[attr.aria-valuetext]': "'Spot column ' + valueNow() + ' percent'",
    '[class.is-dragging]': 'dragging()',
    '(keydown)': 'onKeydown($event)',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointerup)': 'endDrag($event)',
    '(pointercancel)': 'endDrag($event)',
    '(lostpointercapture)': 'endDrag($event)',
    '(dblclick)': 'widthReset.emit()',
  },
})
export class SplitHandleComponent {
  /** The column's current width, px. */
  readonly columnWidth = input.required<number>();
  /** The frame's width, px: the handle's limits are worked out from it. */
  readonly frameWidth = input.required<number>();

  /** The visitor moved the handle (drag, arrow keys, Home, End): the column's new width, already clamped. */
  readonly widthChange = output<number>();
  /** The visitor double-clicked the handle: back to the default width. */
  readonly widthReset = output<void>();
  /** The visitor finished moving the handle: a drag ended or a key step landed, having changed the width. */
  readonly widthCommit = output<void>();

  /** Whether a drag is under way; the grip stays lit for it. */
  protected readonly dragging = signal(false);

  /** The column's share of the frame, in whole percent: the separator's value. */
  protected readonly valueNow = computed(() =>
    percentOf(this.columnWidth(), this.frameWidth()),
  );

  /** The minimum width's share of the frame, in whole percent. */
  protected readonly valueMin = computed(() =>
    percentOf(MIN_COLUMN_WIDTH_PX, this.frameWidth()),
  );

  /** The handle itself, whose pointer capture a drag holds. */
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly zone = inject(NgZone);

  private readonly document = inject(DOCUMENT);

  /** The drag under way, if any. */
  private drag?: Drag;

  /** Whether the drag under way has changed the width, so its end has something to commit. */
  private dragChangedWidth = false;

  /**
   * Attached outside the zone for a drag's length only: a hover must cost no zone turn. The column
   * gains what the pointer has moved left since the press. Measured from the width the drag started
   * at, so the page feeding each new width back never compounds it.
   */
  private readonly followPointer = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const width = clampColumnWidth(
      drag.startWidth + (drag.startX - event.clientX),
      this.frameWidth(),
    );
    if (width !== this.columnWidth()) {
      this.zone.run(() => this.report(width));
      this.dragChangedWidth = true;
    }
  };

  /**
   * Attached for a drag's length only: a native drag starting anywhere would cancel the handle's
   * pointer. The press itself cannot be prevented instead, because it gives the handle its focus.
   */
  private readonly cancelNativeDrag = (event: DragEvent): void =>
    event.preventDefault();

  constructor() {
    // A handle removed mid-drag sees no pointer end, and would go on cancelling the page's drags.
    inject(DestroyRef).onDestroy(() => this.allowNativeDrag());
  }

  /** Moves the column by a key, as the window-splitter pattern asks; other keys are the page's. */
  protected onKeydown(event: KeyboardEvent): void {
    const width = this.columnWidth();
    const frameWidth = this.frameWidth();
    const step = event.shiftKey ? COLUMN_BIG_STEP_PX : COLUMN_STEP_PX;
    let target: number;
    switch (event.key) {
      case 'ArrowLeft':
        target = width + step;
        break;
      case 'ArrowRight':
        target = width - step;
        break;
      case 'Home':
        target = MIN_COLUMN_WIDTH_PX;
        break;
      case 'End':
        target = maxColumnWidth(frameWidth);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (this.report(clampColumnWidth(target, frameWidth))) {
      this.widthCommit.emit();
    }
  }

  /** A primary-button press starts a drag from the column's current width. */
  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.drag) {
      return;
    }
    this.host.setPointerCapture(event.pointerId);
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: this.columnWidth(),
    };
    this.dragging.set(true);
    this.dragChangedWidth = false;
    this.zone.runOutsideAngular(() => {
      this.host.addEventListener('pointermove', this.followPointer);
      this.document.addEventListener('dragstart', this.cancelNativeDrag, true);
    });
  }

  /** The drag's pointer went up, was cancelled or lost its capture: the drag ends. */
  protected endDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    this.drag = undefined;
    if (this.host.hasPointerCapture(drag.pointerId)) {
      this.host.releasePointerCapture(drag.pointerId);
    }
    this.dragging.set(false);
    this.host.removeEventListener('pointermove', this.followPointer);
    this.allowNativeDrag();
    if (this.dragChangedWidth) {
      this.widthCommit.emit();
    }
  }

  private allowNativeDrag(): void {
    this.document.removeEventListener('dragstart', this.cancelNativeDrag, true);
  }

  /** Reports `width` unless it is the width the column already has; says whether it did. */
  private report(width: number): boolean {
    if (width === this.columnWidth()) {
      return false;
    }
    this.widthChange.emit(width);
    return true;
  }
}
