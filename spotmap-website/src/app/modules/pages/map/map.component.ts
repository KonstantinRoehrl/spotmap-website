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
  Injector,
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

/** The width the page switches from the sheet to the map + column layout at. */
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';

/**
 * The widths where the phone top bar leaves the banner too little room for its longer lines; it
 * then shows only the lines of {@link COMPACT_BANNER_MAX_CHARS} glyphs or fewer.
 */
export const COMPACT_BANNER_QUERY = '(max-width: 479px)';

/**
 * The longest line the banner shows in the compact top bar. The banner never sets its text below
 * 12 px, where IBM Plex Mono is 7.2 px a glyph, and on a 320 px phone it is about 137 px wide once
 * the city select has taken the room its longest label needs, so 19 glyphs is what fits there; 18
 * keeps a margin and holds the longest city line, `BRATISLAVA SPOTMAP`. A longer line would run
 * out of the bar and be clipped.
 */
export const COMPACT_BANNER_MAX_CHARS = 18;

/**
 * What an open spot is made of, on the controls that close it: the detail, the column's back
 * button and the sheet's detail head. Focus inside any of them is about to be removed with them.
 */
const OPEN_SPOT_CONTROLS =
  'app-spot-detail, .spot-column__back, .spot-sheet__head-content--detail';

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
 * over the map. The page owns which layout is on screen and so what the map is told is covered,
 * and where keyboard focus goes when an open spot closes; everything else is the
 * {@link SpotBrowserStore}'s.
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

  /** Whether the viewport is a narrow phone's, where the top bar's banner is {@link compactBannerMessages}. */
  protected readonly compact = toSignal(
    this.breakpoints
      .observe(COMPACT_BANNER_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(COMPACT_BANNER_QUERY) },
  );

  /** The banner's lines: the city's own name first, then the house voice. */
  protected readonly bannerMessages = computed(() => [
    `${this.store.city().city.toUpperCase()} SPOTMAP`,
    ...BANNER_LINES,
  ]);

  /** The banner's lines that fit the compact top bar ({@link COMPACT_BANNER_MAX_CHARS} glyphs). */
  protected readonly compactBannerMessages = computed(() =>
    this.bannerMessages().filter(
      (line) => line.length <= COMPACT_BANNER_MAX_CHARS,
    ),
  );

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

  /** The column's back button in detail mode: the frozen list's count, once it is known. */
  protected readonly backLabel = computed(() => {
    const count = this.count();
    return count === null ? '‹ IN VIEW' : `‹ ${count} IN VIEW`;
  });

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

  /**
   * What the notice's polite live region reads: plain words for the not-found notice, nothing
   * while there is none. The region is the page's, not the list's, so it is in place before the
   * notice appears.
   */
  protected readonly noticeAnnouncement = computed(() =>
    this.store.notice() === 'not-found'
      ? 'Spot not found. It is gone from the archive.'
      : '',
  );

  /** The map body under the top bar, measured for the sheet's heights. */
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');

  /**
   * Set while the sheet's own back or close is closing the spot, so the route change that follows
   * does not also move the sheet back to its resting height. Cleared when a spot is open again,
   * so a close that never reached the route cannot swallow a later one.
   */
  private closingFromSheet = false;

  /** The page's own element, searched for the controls focus moves between. */
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Lets the render hook that moves focus be registered from inside an effect. */
  private readonly injector = inject(Injector);

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
        if (id !== null) {
          this.closingFromSheet = false;
        }
        if (previousId === null && id !== null) {
          this.feedSheet('opened');
        } else if (previousId !== null && id === null) {
          this.restoreFocusAfterClose();
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

  /**
   * Keeps keyboard focus from being dropped when the open spot closes. Focus inside the spot's own
   * controls (or already lost) is about to go with them; once the list has rendered it is left on
   * the row that opened the spot if the list put it there, and otherwise moved to a visible head
   * of the list: the column's count line, or the sheet's head. A phone's rows are out of reach
   * while the sheet is at its peek bar, so a ✕ always ends on the sheet's head. Focus the visitor
   * had put anywhere else is left alone.
   */
  private restoreFocusAfterClose(): void {
    const active = this.host.ownerDocument.activeElement;
    if (
      active !== null &&
      active !== this.host.ownerDocument.body &&
      !active.closest(OPEN_SPOT_CONTROLS)
    ) {
      return;
    }
    // The `read` phase runs after the list's own effect has tried to focus the opener's row.
    afterNextRender(
      {
        read: () => {
          if (this.host.ownerDocument.activeElement?.closest('a.spot-row')) {
            return;
          }
          this.host
            .querySelector<HTMLElement>(
              this.wide() ? '.spot-column__count-line' : '.spot-sheet__toggle',
            )
            ?.focus();
        },
      },
      { injector: this.injector },
    );
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
