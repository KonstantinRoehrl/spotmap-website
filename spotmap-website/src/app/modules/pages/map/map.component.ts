import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, map } from 'rxjs';
import { MapInsets, NO_INSETS } from '../../../models/map/map-camera';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { CityPickerComponent } from '../../components/city-picker/city-picker.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';
import { SpotDetailComponent } from '../../components/spot-detail/spot-detail.component';
import { SpotListComponent } from '../../components/spot-list/spot-list.component';
import { SpotSheetComponent } from '../../components/spot-sheet/spot-sheet.component';
import {
  INITIAL_SHEET,
  nextSheet,
  SheetEvent,
  SheetModel,
  sheetHeight,
} from '../../components/spot-sheet/spot-sheet-state';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { SpotBrowserStore } from './spot-browser.store';

/** The width the page switches from the sheet to the map + column layout at (spec §3). */
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';

/** How long the count must hold still before the live region reads it, so a pan does not chatter. */
export const COUNT_ANNOUNCE_DEBOUNCE_MS = 800;

/** The banner's lines after the city's own; the house voice the map page has always cycled. */
const BANNER_LINES = [
  'RESPECT THE LOCALS',
  'EXPLORE THE CONCRETE JUNGLE',
  'TOUCH THE UNTOUCHED SPOTS',
  'CAN SOMEONE BRING WAX?',
  'LET`S GO PLAZA',
  'SKATEVIDEOS > INSTAGRAM',
  'SUPPORTED BY ROLLTROTTEL-VERBAND',
  'ANYONE HAS A PIN?',
  'JUST SOME RANDOM TEXT',
  'FOR EDUCATIONAL PURPOSES ONLY',
  'CONTINUOUSLY UPDATED',
];

/**
 * The map page, served for `/map` and `/spot/<id>` by one route, so a spot opening, closing or
 * switching never rebuilds the map. From 1024 px the map runs edge to edge beside a column holding
 * the banner, the city picker, the count and the list or the open spot; below that a slim top bar
 * carries the banner and the picker and a bottom sheet (peek / list / detail) holds the same pane
 * over the map. The page owns which layout is on screen and so what the map is told is covered;
 * everything else is the {@link SpotBrowserStore}'s.
 */
@Component({
  selector: 'app-map',
  imports: [
    AsciiAnimationTextComponent,
    CityPickerComponent,
    MapContainerComponent,
    NgTemplateOutlet,
    PointerBloomDirective,
    SpotDetailComponent,
    SpotListComponent,
    SpotSheetComponent,
  ],
  providers: [SpotBrowserStore],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointerdown)': 'store.dismissNotice()',
    '(keydown)': 'store.dismissNotice()',
  },
})
export class MapComponent {
  /** The page's state: city, selection, list, detail, notice. */
  protected readonly store = inject(SpotBrowserStore);

  /** Watches the viewport width for the 1024 px switch between the sheet and the column. */
  private readonly breakpoints = inject(BreakpointObserver);

  /** Whether the viewport is at least 1024 px wide: the column layout; else the sheet. */
  protected readonly wide = toSignal(
    this.breakpoints
      .observe(WIDE_LAYOUT_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(WIDE_LAYOUT_QUERY) },
  );

  /** The banner's lines: the city's own name first, then the house voice. */
  protected readonly bannerMessages = computed(() => [
    `${this.store.city().city.toUpperCase()} SPOTMAP`,
    ...BANNER_LINES,
  ]);

  /** The sheet's height and where it returns to; drives the phone layout only. */
  protected readonly sheet = signal<SheetModel>(
    this.store.selectedId() === null
      ? INITIAL_SHEET
      : nextSheet(INITIAL_SHEET, 'opened'),
  );

  /** The map body's height, measured; the sheet's heights are fractions of it. */
  protected readonly bodyHeight = signal(0);

  /** How many spots the list shows, or null while they are still unknown. */
  protected readonly count = computed(
    () => this.store.shownSpots()?.length ?? null,
  );

  /** The column's count line in list mode. */
  protected readonly countLine = computed(() => {
    const count = this.count();
    if (count === null) {
      return '> LOADING SPOTS…';
    }
    return `> ${count} ${count === 1 ? 'SPOT' : 'SPOTS'} IN VIEW`;
  });

  /** The column's back button in detail mode: the frozen list's count. */
  protected readonly backLabel = computed(
    () => `‹ ${this.count() ?? 0} IN VIEW`,
  );

  /** The part of the map the UI covers: nothing beside the column, the sheet's height on a phone. */
  protected readonly coveredInsets = computed<MapInsets>(() =>
    this.wide()
      ? NO_INSETS
      : {
          ...NO_INSETS,
          bottom: sheetHeight(this.sheet().state, this.bodyHeight()),
        },
  );

  /** What the polite live region reads: the count once it has held still, plain words. */
  protected readonly announcement = toSignal(
    toObservable(
      computed(() => {
        const count = this.count();
        return count === null
          ? ''
          : `${count} ${count === 1 ? 'spot' : 'spots'} in view`;
      }),
    ).pipe(debounceTime(COUNT_ANNOUNCE_DEBOUNCE_MS)),
    { initialValue: '' },
  );

  /** The map body under the top bar, measured for the sheet's heights. */
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');

  /**
   * Set while the sheet's own back or close is closing the spot, so the route change that follows
   * does not also move the sheet back to its resting height.
   */
  private closingFromSheet = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const body = this.body().nativeElement;
      this.bodyHeight.set(body.clientHeight);
      const observer = new ResizeObserver(() =>
        this.bodyHeight.set(body.clientHeight),
      );
      observer.observe(body);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    let previousId = this.store.selectedId();
    effect(() => {
      const id = this.store.selectedId();
      untracked(() => {
        if (previousId === null && id !== null) {
          this.feedSheet('opened');
        } else if (previousId !== null && id === null) {
          if (this.closingFromSheet) {
            this.closingFromSheet = false;
          } else {
            this.feedSheet('closed-elsewhere');
          }
        }
        previousId = id;
      });
    });

    effect(() => {
      if (this.store.notice() === 'not-found') {
        untracked(() => this.feedSheet('not-found'));
      }
    });
  }

  /** Moves the sheet by one event of its state machine. */
  protected feedSheet(event: SheetEvent): void {
    this.sheet.update((model) => nextSheet(model, event));
  }

  /** The sheet's `‹ … IN VIEW`: back to the list, closing the spot. */
  protected onSheetBack(): void {
    this.feedSheet('back');
    this.closeSpot();
  }

  /** The sheet's `✕`: down to the peek bar, closing the spot. */
  protected onSheetClose(): void {
    this.feedSheet('close');
    this.closeSpot();
  }

  /** A tap on the map that missed every pin closes an open spot, down to the peek bar. */
  protected onEmptyMapTap(): void {
    if (this.store.selectedId() === null) {
      return;
    }
    this.feedSheet('map-tap');
    this.closeSpot();
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
