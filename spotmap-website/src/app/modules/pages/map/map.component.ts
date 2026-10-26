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
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { CityPickerComponent } from '../../components/city-picker/city-picker.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';
import { OverviewBackComponent } from '../../components/overview-back/overview-back.component';
import {
  clearColumnShare,
  columnWidthFor,
  readColumnShare,
  storeColumnShare,
} from '../../components/split-handle/column-split';
import { SplitHandleComponent } from '../../components/split-handle/split-handle.component';
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
import { SpotBrowserStore } from './spot-browser.store';
import {
  bannerSlotWidth,
  fittingBannerLines,
  HEADER_BANNER_FONT_PX,
  pickerMinWidth,
  RESTING_BANNER_LINE,
  TOPBAR_BANNER_FONT_PX,
  TOPBAR_GAP_PX,
} from './topbar-banner';

/** The width the page switches from the sheet to the map + column layout at. */
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';

/**
 * The widths that get the phone top bar instead of the header row: the bottom navigation's own
 * breakpoint, below which the nav leaves the top of the screen to the page.
 */
export const PHONE_LAYOUT_QUERY = '(max-width: 768px)';

/**
 * What an open spot is made of, on the controls that close it: the detail, the back plate and the
 * sheet's detail head. Focus inside any of them is about to be removed with them.
 */
const OPEN_SPOT_CONTROLS =
  'app-spot-detail, app-overview-back, .spot-sheet__head-content--detail';

/** How long the count must hold still before the live region reads it, so a pan does not chatter. */
export const COUNT_ANNOUNCE_DEBOUNCE_MS = 800;

/**
 * How long the column eases back to its default width after a double-click on the split handle:
 * the sheet's and the camera's 330 ms, so the page's own resizes all move on one beat.
 */
export const COLUMN_RESET_EASE_MS = 330;

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

/** The map window's size in px, as the page measured it. */
interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The map page, served for `/map` and `/spot/<id>` by one route, so a spot opening, closing or
 * switching never rebuilds the map. The map always sits in one framed window inside the page's
 * gutter. From 1024 px a header row carries the banner and the city picker above it, and the
 * window holds the map, a split handle that resizes it against the spot column, and the column
 * with its toolbar and the list or the open spot. From 769 to 1023 px the same header row sits
 * over a window whose bottom sheet (peek / list / detail, never more than half of it) holds that
 * pane. On a phone a top bar carries the banner and the picker instead, the banner's slot widening
 * to whatever line it plays while the picker gives up room down to its label's width. The page
 * owns which layout is on screen and so what the map is told is covered, how wide the column is,
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
    OverviewBackComponent,
    SplitHandleComponent,
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

  /** Watches the viewport width for the 1024 px and 768 px layout switches. */
  private readonly breakpoints = inject(BreakpointObserver);

  /** Whether the viewport is at least 1024 px wide: the column layout; else the sheet. */
  protected readonly wide = toSignal(
    this.breakpoints
      .observe(WIDE_LAYOUT_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(WIDE_LAYOUT_QUERY) },
  );

  /** Whether the viewport is a phone's, at most 768 px: the top bar instead of the header row. */
  protected readonly phone = toSignal(
    this.breakpoints
      .observe(PHONE_LAYOUT_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(PHONE_LAYOUT_QUERY) },
  );

  /** The banner's lines: the city's own name first, then the house voice. */
  protected readonly bannerMessages = computed(() => [
    `${this.store.city().city.toUpperCase()} SPOTMAP`,
    ...BANNER_LINES,
  ]);

  /** The header row's banner size: set, not fitted, so the row's height never moves. */
  protected readonly headerBannerFontPx = HEADER_BANNER_FONT_PX;

  /** The top bar's banner size: the Display tier's small size. */
  protected readonly topbarBannerFontPx = TOPBAR_BANNER_FONT_PX;

  /** The top bar's width inside its padding, measured; 0 until it has been. */
  private readonly topbarWidth = signal(0);

  /** The line the top bar's banner is playing, or about to: what its slot is as wide as. */
  private readonly topbarLine = signal(RESTING_BANNER_LINE);

  /** The city as the closed picker shows it, `<city> · <country code>`. */
  private readonly pickerLabel = computed(() => {
    const city = this.store.city();
    return `${city.city} · ${city.countryCode}`;
  });

  /** The narrowest the top bar's picker may get: its label unclipped, the arrow and its padding. */
  protected readonly pickerMinWidth = computed(() =>
    pickerMinWidth(this.pickerLabel()),
  );

  /**
   * The top bar banner's lines: the resting `SPOTMAP` first, then the city's line and the house
   * voice, less every line that could not fit beside the picker's minimum at the bar's width.
   * Before the bar is measured, and should nothing fit, the resting line alone.
   */
  protected readonly topbarMessages = computed(() => {
    const width = this.topbarWidth();
    const lines =
      width > 0
        ? fittingBannerLines(
            [RESTING_BANNER_LINE, ...this.bannerMessages()],
            width,
            this.pickerLabel(),
          )
        : [];
    return lines.length > 0 ? lines : [RESTING_BANNER_LINE];
  });

  /**
   * The top bar banner's slot: as wide as the line it is playing, never so wide that the picker
   * would have to narrow past its label.
   */
  protected readonly topbarSlotWidth = computed(() =>
    Math.min(
      bannerSlotWidth(this.topbarLine(), TOPBAR_BANNER_FONT_PX),
      Math.max(this.topbarWidth() - TOPBAR_GAP_PX - this.pickerMinWidth(), 0),
    ),
  );

  /** The sheet's height and where it returns to; drives the layouts under 1024 px only. */
  protected readonly sheet = signal<SheetModel>(
    this.store.selectedId() === null
      ? INITIAL_SHEET
      : nextSheet(INITIAL_SHEET, 'opened'),
  );

  /**
   * The map window's size, measured: the sheet's heights are shares of its height, and the
   * column's width and limits come from its width.
   */
  protected readonly frameSize = signal<FrameSize>({ width: 0, height: 0 });

  /** The column's remembered share of the window, or `null` while it has its default width. */
  private readonly columnShare = signal(readColumnShare());

  /**
   * The column's width in px on a wide screen: its share of the window, or the default, held
   * inside the handle's limits. The share is what holds when the window is resized.
   */
  protected readonly columnWidth = computed(() =>
    columnWidthFor(this.columnShare(), this.frameSize().width),
  );

  /** Set while the column eases back to its default width after the handle's reset. */
  protected readonly columnEasing = signal(false);

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

  /**
   * The part of the map the UI covers: nothing in the wide window, where the column sits beside
   * the map; the sheet's height, a share of the window, below 1024 px.
   */
  protected readonly coveredInsets = computed<MapInsets>(() =>
    this.wide()
      ? NO_INSETS
      : {
          ...NO_INSETS,
          bottom: sheetHeight(this.sheet().state, this.frameSize().height),
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

  /** The map window, measured for the sheet's heights and the column's width. */
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  /** The phone top bar, measured for the room its banner and picker share; absent elsewhere. */
  private readonly topbar = viewChild<ElementRef<HTMLElement>>('topbar');

  /**
   * Set while the sheet's own back or close is closing the spot, so the route change that follows
   * does not also move the sheet back to its resting height. Cleared when a spot is open again,
   * so a close that never reached the route cannot swallow a later one.
   */
  private closingFromSheet = false;

  /**
   * Ends the column's reset ease when no `transitionend` does: none fires when the column was
   * already at its default width.
   */
  private columnEaseTimer?: ReturnType<typeof setTimeout>;

  /** The page's own element, searched for the controls focus moves between. */
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Lets the render hook that moves focus be registered from inside an effect. */
  private readonly injector = inject(Injector);

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.columnEaseTimer));

    afterNextRender(() => {
      const frame = this.frame().nativeElement;
      const measure = () =>
        this.frameSize.set({
          width: frame.clientWidth,
          height: frame.clientHeight,
        });
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(frame);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    // The bar comes and goes with the phone breakpoint, so the one observer follows whichever bar
    // is on screen. Its content box is the room inside the bar's padding.
    const topbarObserver = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width;
      if (width !== undefined) {
        this.topbarWidth.set(width);
      }
    });
    destroyRef.onDestroy(() => topbarObserver.disconnect());
    effect(() => {
      const bar = this.topbar()?.nativeElement;
      topbarObserver.disconnect();
      if (bar) {
        topbarObserver.observe(bar);
      }
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

  /** The top bar's banner is about to type `line`: its slot widens or narrows to it. */
  protected onTopbarLine(line: string): void {
    this.topbarLine.set(line);
  }

  /** The sheet's < OVERVIEW plate: back to the list, closing the spot. */
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
   * The handle moved: the column takes the new width, remembered as its share of the window so a
   * later window size keeps the proportion. The handle has already clamped the width.
   */
  protected onColumnWidth(width: number): void {
    const frameWidth = this.frameSize().width;
    if (frameWidth <= 0) {
      return;
    }
    const share = Math.min(width / frameWidth, 0.5);
    this.columnShare.set(share);
    storeColumnShare(share);
  }

  /**
   * The handle was double-clicked: the column goes back to its default width and the share is
   * forgotten. The width eases over {@link COLUMN_RESET_EASE_MS}; under reduced motion it changes at
   * once (the motion net would drop the width transition anyway, so no class is set there).
   */
  protected resetColumnWidth(): void {
    clearColumnShare();
    this.stopColumnEase();
    if (!prefersReducedMotion()) {
      this.columnEasing.set(true);
      this.columnEaseTimer = setTimeout(
        () => this.stopColumnEase(),
        COLUMN_RESET_EASE_MS + 50,
      );
    }
    this.columnShare.set(null);
  }

  /** The column's own width transition ended: the reset ease is over. */
  protected onColumnTransitionEnd(event: TransitionEvent): void {
    if (
      event.target === event.currentTarget &&
      event.propertyName === 'width'
    ) {
      this.stopColumnEase();
    }
  }

  /** Drops the reset ease and its timer, so a drag after it follows the pointer at once. */
  private stopColumnEase(): void {
    clearTimeout(this.columnEaseTimer);
    this.columnEaseTimer = undefined;
    this.columnEasing.set(false);
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
