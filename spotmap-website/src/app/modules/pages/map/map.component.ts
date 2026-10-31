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
  linkedSignal,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, map } from 'rxjs';
import { MapInsets, NO_INSETS } from '../../../models/map/map-camera';
import { CityPickerComponent } from '../../components/city-picker/city-picker.component';
import { MapBannerComponent } from '../../components/map-banner/map-banner.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';
import { OverviewBackComponent } from '../../components/overview-back/overview-back.component';
import { SplitHandleComponent } from '../../components/split-handle/split-handle.component';
import { SpotDetailComponent } from '../../components/spot-detail/spot-detail.component';
import { SpotListComponent } from '../../components/spot-list/spot-list.component';
import { SpotMapComponent } from '../../components/spot-map/spot-map.component';
import { SpotSheetComponent } from '../../components/spot-sheet/spot-sheet.component';
import { sheetHeight } from '../../components/spot-sheet/spot-sheet-state';
import { ColumnSplitState } from './column-split-state';
import { SheetController } from './sheet-controller';
import { SpotBrowserStore } from './spot-browser.store';

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

/** The list behind an open spot. A row in it can still be `activeElement` until the browser's focus fixup. */
const HIDDEN_LIST = 'app-spot-list[inert]';

/** A row the visitor can actually be on: the hidden list's rows do not count. */
const SHOWN_ROW = 'app-spot-list:not([inert]) a.spot-row';

/** How long the count must hold still before the live region reads it, so a pan does not chatter. */
export const COUNT_ANNOUNCE_DEBOUNCE_MS = 800;

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
 * with its toolbar and the list or the open spot. The list stays mounted behind an open spot. From
 * 769 to 1023 px the same header row sits over a window whose bottom sheet (peek / list / detail,
 * never more than half of it) holds that pane. On a phone a top bar carries them instead as two
 * fixed rows, the banner over the picker, neither sized by the line playing or the city chosen. The
 * city picker, and the Material it is built on, loads once the page is idle; an inert frame holds
 * its slot until then. The page owns which layout is on screen and so what the map is told is
 * covered, and where keyboard focus goes when an open spot closes. The banner is
 * {@link MapBannerComponent}'s, the column's width {@link ColumnSplitState}'s, the sheet's height
 * {@link SheetController}'s, and everything else the {@link SpotBrowserStore}'s.
 */
@Component({
  selector: 'app-map',
  imports: [
    CityPickerComponent,
    MapBannerComponent,
    MapContainerComponent,
    NgTemplateOutlet,
    OverviewBackComponent,
    SplitHandleComponent,
    SpotDetailComponent,
    SpotListComponent,
    SpotMapComponent,
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

  /** The sheet's height and what moves it; drives the layouts under 1024 px only. */
  protected readonly sheet = new SheetController(this.store);

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

  /**
   * The map window's size, measured: the sheet's heights are shares of its height, and the
   * column's width and limits come from its width.
   */
  protected readonly frameSize = signal<FrameSize>({ width: 0, height: 0 });

  /** The spot column's width, reset ease and persistence, against the measured window. */
  protected readonly column = new ColumnSplitState(
    computed(() => this.frameSize().width),
  );

  /**
   * Whether the list exists: from the first moment no spot is open. A cold `/spot/<id>` link builds
   * no list and loads no thumbnails until its first close.
   */
  protected readonly listMounted = linkedSignal<boolean, boolean>({
    source: () => this.store.detail() === null,
    computation: (closed, previous) => closed || (previous?.value ?? false),
  });

  /**
   * Keys the mounted list. A close whose rows differ from those it was showing would collapse the
   * leaving rows mid-crossfade and land the old offset among different spots, so it builds a new
   * list instead. Identity is enough: the store keeps the previous array for an equal answer.
   */
  protected readonly listKey = linkedSignal<
    { readonly open: boolean; readonly spots: unknown },
    number
  >({
    source: () => ({
      open: this.store.detail() !== null,
      spots: this.store.shownSpots(),
    }),
    computation: (now, previous) => {
      if (!previous) {
        return 0;
      }
      const closedOntoOtherRows =
        previous.source.open &&
        !now.open &&
        now.spots !== previous.source.spots;
      return closedOntoOtherRows ? previous.value + 1 : previous.value;
    },
  });

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
          bottom: sheetHeight(this.sheet.state(), this.frameSize().height),
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

  /**
   * The deferred city pickers on screen, found by their template name: naming the picker's class
   * here would load it, and the Material it is built on, with this page instead of on idle.
   */
  private readonly pickers = viewChildren('cityPicker', { read: ElementRef });

  /**
   * Set once a deferred city picker has rendered, and never cleared: a picker slot built later,
   * by a layout switch, renders the picker at once instead of a placeholder.
   */
  protected readonly pickerLoaded = signal(false);

  /** The page's own element, searched for the controls focus moves between. */
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Lets the render hook that moves focus be registered from inside an effect. */
  private readonly injector = inject(Injector);

  constructor() {
    const destroyRef = inject(DestroyRef);
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

    effect(() => {
      if (this.pickers().length > 0) {
        this.pickerLoaded.set(true);
      }
    });

    effect(() => {
      if (this.store.selectionEvent()?.kind === 'closed') {
        untracked(() => this.restoreFocusAfterClose());
      }
    });
  }

  /**
   * Keeps keyboard focus from being dropped when the open spot closes. Focus inside the spot's own
   * controls (or already lost) is about to go with them; once the list has rendered it is left on
   * the row that opened the spot if the list put it there, and otherwise moved to a visible head
   * of the list: the column's count line, or the sheet's head. A phone's rows are out of reach
   * while the sheet is at its peek bar, so a ✕ always ends on the sheet's head. Focus the visitor
   * had put anywhere else is left alone. A row in the hidden list counts as lost focus: the
   * browser's fixup may simply not have run yet.
   */
  private restoreFocusAfterClose(): void {
    const active = this.host.ownerDocument.activeElement;
    if (
      active !== null &&
      active !== this.host.ownerDocument.body &&
      !active.closest(OPEN_SPOT_CONTROLS) &&
      !active.closest(HIDDEN_LIST)
    ) {
      return;
    }
    // The `read` phase runs after the list's own effect has tried to focus the opener's row.
    afterNextRender(
      {
        read: () => {
          if (this.host.ownerDocument.activeElement?.closest(SHOWN_ROW)) {
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
}
