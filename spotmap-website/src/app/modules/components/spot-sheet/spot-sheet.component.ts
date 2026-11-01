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
  NgZone,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { OverviewBackComponent } from '../overview-back/overview-back.component';
import { attachBodyTouch } from './sheet-body-touch';
import { attachHeadDrag, SheetDrag } from './sheet-drag-session';
import { SheetSettleFade } from './sheet-settle-fade';
import {
  SheetState,
  SheetStop,
  sheetStopOf,
  sheetStops,
  stopAbove,
  stopAfterHandleTap,
  stopBelow,
} from './spot-sheet-state';

/** The handle's separator value at each stop. */
const HANDLE_VALUE: Record<SheetStop, { now: number; text: string }> = {
  peek: { now: 0, text: 'Closed' },
  half: { now: 50, text: 'Half height' },
  full: { now: 100, text: 'Full height' },
};

/**
 * The phone and tablet layout's sheet inside the map frame: a 64 px head (the grab handle in its
 * top padding, its controls 16 px from every edge) over a scrolling body holding the projected
 * pane. It is presentational. The page keeps the `SheetModel`, feeds `nextSheet()` from the
 * outputs below, and reads the same `sheetHeight()` to tell the map how much of it is covered.
 * Heights change by tapping the head or the handle, by the handle's keys, or by dragging either.
 * The drag lives in `sheet-drag-session.ts` and `sheet-body-touch.ts`.
 */
@Component({
  selector: 'app-spot-sheet',
  imports: [PointerBloomDirective, OverviewBackComponent],
  templateUrl: './spot-sheet.component.html',
  styleUrls: ['./spot-sheet.component.css', './spot-sheet-handle.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--sheet-height]': "height() + 'px'",
    '[style.--sheet-rise]': "stop() === 'full' ? 1 : 0",
    '[class.spot-sheet--dragging]': 'dragging()',
  },
})
export class SpotSheetComponent {
  /** How far the sheet is open. */
  state = input.required<SheetState>();
  /** The height in px of the frame the sheet sits in; the open list and detail take half of it. */
  availableHeight = input.required<number>();
  /** Whether the open sheet is at the page's full height. */
  full = input(false);
  /** The height in px of the page area, which the full sheet takes. */
  pageHeight = input(0);
  /** How many spots are in view, or `null` while the city's spots are still loading. */
  count = input<number | null>(null);

  /** The head was tapped at peek or list: toggle between them. */
  headTap = output<void>();
  /** The detail's back plate (< OVERVIEW): return to the list. */
  back = output<void>();
  /** The detail's close button (✕): close the detail to the peek bar. */
  close = output<void>();
  /** The sheet came to rest at a height by a drag, or by the handle's tap or keys. */
  settle = output<SheetStop>();

  /** Each stop's height in px. */
  private readonly stops = computed(() =>
    sheetStops(this.availableHeight(), this.pageHeight()),
  );

  /** The stop the sheet rests at. */
  protected readonly stop = computed(() =>
    sheetStopOf(this.state(), this.full()),
  );

  /** The sheet's height for its stop, in px. */
  protected readonly height = computed(() => this.stops()[this.stop()]);

  /** Whether a drag is under way: the pane shows, even from peek, and the grip stays lit. */
  protected readonly dragging = signal(false);

  /** The separator's value at this stop. */
  protected readonly handleValue = computed(
    () => HANDLE_VALUE[this.stop()].now,
  );

  /** The separator's value in words at this stop. */
  protected readonly handleValueText = computed(
    () => HANDLE_VALUE[this.stop()].text,
  );

  /** The head's count line: plural, singular, or the loading line while the count is unknown. */
  protected readonly countLine = computed(() => {
    const count = this.count();
    if (count === null) {
      return '> LOADING SPOTS…';
    }
    return count === 1 ? '> 1 SPOT IN VIEW' : `> ${count} SPOTS IN VIEW`;
  });

  private readonly hostElement =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private readonly head = viewChild.required<ElementRef<HTMLElement>>('head');
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');

  /** The settle's crossfade under reduced motion, in place of the travel. */
  private readonly fade = new SheetSettleFade(this.hostElement);

  /** The drag, fed by whichever input begins it. */
  private readonly drag = new SheetDrag(this.hostElement, () => this.stops(), {
    started: () =>
      this.zone.run(() => {
        this.fade.cancel();
        this.dragging.set(true);
      }),
    settled: (stop) =>
      this.zone.run(() => {
        this.dragging.set(false);
        this.settle.emit(stop);
      }),
    release: (clearHeldGeometry) => {
      if (prefersReducedMotion()) {
        this.fade.run(clearHeldGeometry);
      } else {
        clearHeldGeometry();
      }
    },
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Required inputs can't be read before their first binding, so the first run only records where
    // the sheet is, which also means the first render never fades. The effect runs in the binding's
    // tick, before paint, so the hold's write lands before the new height can show.
    let shownStop: SheetStop | null = null;
    let shownHeight = 0;
    effect(() => {
      const stop = this.stop();
      const height = this.height();
      untracked(() => {
        if (
          shownStop !== null &&
          stop !== shownStop &&
          prefersReducedMotion() &&
          !this.fade.goingOut &&
          !this.dragging()
        ) {
          this.fade.run(this.drag.hold(shownHeight));
        }
        shownStop = stop;
        shownHeight = height;
      });
    });
    destroyRef.onDestroy(() => this.fade.cancel());
    afterNextRender(() => {
      destroyRef.onDestroy(
        attachHeadDrag(this.head().nativeElement, this.drag, this.zone),
      );
      destroyRef.onDestroy(
        attachBodyTouch(
          this.body().nativeElement,
          this.drag,
          () => this.full(),
          this.zone,
        ),
      );
    });
  }

  /** A tap on the handle. A press that became a drag never gets here. */
  protected onHandleClick(): void {
    this.settle.emit(stopAfterHandleTap(this.stop()));
  }

  /** Moves the sheet by a key on the handle; other keys are the page's. */
  protected onHandleKeydown(event: KeyboardEvent): void {
    const stop = this.stop();
    const targets: Record<string, SheetStop | undefined> = {
      ArrowUp: stopAbove(stop),
      ArrowDown: stopBelow(stop),
      Home: 'peek',
      End: 'full',
      Enter: stopAfterHandleTap(stop),
      ' ': stopAfterHandleTap(stop),
    };
    const target = targets[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    this.settle.emit(target);
  }
}
