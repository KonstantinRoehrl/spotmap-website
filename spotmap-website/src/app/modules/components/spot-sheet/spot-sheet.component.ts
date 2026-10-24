import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { SheetState, sheetHeight } from './spot-sheet-state';

/**
 * The phone layout's bottom sheet over the map (spec §4.2): a grab handle, a 44px head row and a
 * scrolling body holding the projected pane. It is presentational. The page keeps the
 * `SheetModel`, feeds `nextSheet()` from the outputs below, and reads the same `sheetHeight()` to
 * tell the map how much of it is covered. Heights change by tapping the head. The handle only
 * marks the sheet as one, and dragging is not offered.
 */
@Component({
  selector: 'app-spot-sheet',
  imports: [PointerBloomDirective],
  templateUrl: './spot-sheet.component.html',
  styleUrl: './spot-sheet.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.height.px]': 'height()' },
})
export class SpotSheetComponent {
  /** How far the sheet is open. */
  state = input.required<SheetState>();
  /** The px free above the sheet's bottom edge, which its list and detail heights are shares of. */
  availableHeight = input.required<number>();
  /** How many spots are in view, or `null` while the city's spots are still loading. */
  count = input<number | null>(null);

  /** The head was tapped at peek or list: toggle between them. */
  headTap = output<void>();
  /** The detail's back button (‹): return to the list. */
  back = output<void>();
  /** The detail's close button (✕): close the detail to the peek bar. */
  close = output<void>();

  /** The sheet's height for its state, in px. */
  protected readonly height = computed(() =>
    sheetHeight(this.state(), this.availableHeight()),
  );

  /** The head's count line: plural, singular, or the loading line while the count is unknown. */
  protected readonly countLine = computed(() => {
    const count = this.count();
    if (count === null) {
      return '> LOADING SPOTS…';
    }
    return count === 1 ? '> 1 SPOT IN VIEW' : `> ${count} SPOTS IN VIEW`;
  });

  /** The detail's back label, carrying the count of the list it returns to. */
  protected readonly backLabel = computed(() => {
    const count = this.count();
    return count === null ? '‹ IN VIEW' : `‹ ${count} IN VIEW`;
  });
}
