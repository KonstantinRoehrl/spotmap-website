import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, input, signal } from '@angular/core';
import {
  ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  discardPeriodicTasks,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, map } from 'rxjs';

import { CityEnum } from '../../../models/enums/map-enum';
import { MapFocus, NO_INSETS } from '../../../models/map/map-camera';
import type { MapLoadEvent } from '../../../models/map/map-load-event';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import type { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import type {
  SpotListCollection,
  SpotListFeature,
} from '../../../models/spots/spot';
import type { SpotDetailView } from '../../../models/spots/spot-detail-view';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { CityPickerComponent } from '../../components/city-picker/city-picker.component';
import { MapBannerComponent } from '../../components/map-banner/map-banner.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
} from '../../components/spot-map/map-factory.token';
import { SpotMapComponent } from '../../components/spot-map/spot-map.component';
import { SpotDetailComponent } from '../../components/spot-detail/spot-detail.component';
import { SpotListComponent } from '../../components/spot-list/spot-list.component';
import { SpotSheetComponent } from '../../components/spot-sheet/spot-sheet.component';
import {
  COLUMN_SHARE_STORAGE_KEY,
  columnWidthFor,
  DEFAULT_COLUMN_WIDTH_PX,
} from '../../components/split-handle/column-split';
import { SplitHandleComponent } from '../../components/split-handle/split-handle.component';
import { sheetHeight } from '../../components/spot-sheet/spot-sheet-state';
import {
  COLUMN_RESET_EASE_MS,
  COUNT_ANNOUNCE_DEBOUNCE_MS,
  MapComponent,
  PHONE_LAYOUT_QUERY,
  WIDE_LAYOUT_QUERY,
} from './map.component';
import {
  bannerLineWidth,
  HEADER_BANNER_FONT_PX,
  RESTING_BANNER_LINE,
  TOPBAR_BANNER_FONT_PX,
} from '../../components/map-banner/topbar-banner';
import { SpotBrowserStore } from './spot-browser.store';

/**
 * The map factories and the elevation loader are injected the moment SpotMapComponent is built;
 * never-resolving stubs keep the ESM-only maplibre-gl and maplibre-contour out of the Karma bundle
 * (map-factory.token.ts). The map's own template is blanked: the page is under test, not the map.
 */
const neverResolves = () => new Promise<never>(() => {});

/** The ASCII banner without its endless typewriter timers, which no fakeAsync zone could drain. */
@Component({ selector: 'app-ascii-animation-text', template: '' })
class StubBannerComponent {
  readonly messages = input<string[]>([]);
  readonly waitFrames = input(0);
  readonly animationSpeed = input(0);
  readonly loop = input(false);
  readonly centered = input(false);
  readonly fixedFontSize = input<number | null>(null);
  readonly dotGutters = input(true);
}

function listFeature(id: string, name: string): SpotListFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [16.37, 48.2] },
    properties: { id, name, status: 'active', cover: null, photoCount: 0 },
  };
}

const ALPHA = listFeature('a', 'Alpha Bank');
const BETA = listFeature('b', 'Beta Ledge');

/** What the browser paints for a token, so assertions compare rendered values, not token text. */
function painted(property: string, token: string): string {
  const probe = document.createElement('span');
  probe.style.setProperty(property, token);
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return value;
}

/** A store the specs drive by hand: every state a writable signal, every action a spy. */
function fakeStore() {
  return {
    city: signal(SUPPORTED_CITIES[CityEnum.Vienna]),
    mapCity: signal<CityEnum | null>(CityEnum.Vienna),
    openOn: signal<MapFocus | null>(null),
    selectedId: signal<string | null>(null),
    shownSpots: signal<readonly SpotListFeature[] | null>(null),
    mapSpots: signal<SpotListCollection | null>(null),
    listEvents: signal<readonly MapLoadEvent[]>([]),
    listFailed: signal(false),
    listAttempt: signal(0),
    detail: signal<SpotDetailView | null>(null),
    notice: signal<'not-found' | null>(null),
    hoveredId: signal<string | null>(null),
    returnFocusTo: signal<string | null>(null),
    selectCity: jasmine.createSpy('selectCity'),
    setBounds: jasmine.createSpy('setBounds'),
    open: jasmine.createSpy('open'),
    close: jasmine.createSpy('close'),
    retryDetail: jasmine.createSpy('retryDetail'),
    setHovered: jasmine.createSpy('setHovered'),
    dismissNotice: jasmine.createSpy('dismissNotice'),
    mapGaveUp: jasmine.createSpy('mapGaveUp'),
    reloadList: jasmine.createSpy('reloadList'),
  };
}

describe('MapComponent', () => {
  let fixture: ComponentFixture<MapComponent>;
  let store: ReturnType<typeof fakeStore>;
  /** Whether the viewport is at least 1024 px wide, as the breakpoint stub reports it. */
  let wide: BehaviorSubject<boolean>;
  /** Whether the viewport is at most 768 px wide (the phone top bar), as the breakpoint stub reports it. */
  let phone: BehaviorSubject<boolean>;
  /**
   * How the page's deferred city picker renders: by hand (Manual), so a spec decides when it
   * loads, except where a spec block switches to Playthrough to watch the real triggers.
   */
  let deferBehavior = DeferBlockBehavior.Manual;

  /** The stub's answer for `query`: the wide or the phone breakpoint; nothing else is asked. */
  function subjectFor(query: string): BehaviorSubject<boolean> {
    if (query === WIDE_LAYOUT_QUERY) {
      return wide;
    }
    if (query === PHONE_LAYOUT_QUERY) {
      return phone;
    }
    throw new Error(`unexpected breakpoint query ${query}`);
  }

  beforeEach(async () => {
    store = fakeStore();
    wide = new BehaviorSubject(true);
    phone = new BehaviorSubject(false);
    await TestBed.configureTestingModule({
      imports: [MapComponent],
      deferBlockBehavior: deferBehavior,
      providers: [
        { provide: MAP_FACTORY, useValue: neverResolves },
        { provide: ELEVATION_LOADER, useValue: neverResolves },
        {
          provide: BreakpointObserver,
          useValue: {
            isMatched: (query: string) => subjectFor(query).value,
            observe: (query: string) =>
              subjectFor(query).pipe(
                map((matches) => ({
                  matches,
                  breakpoints: { [query]: matches },
                })),
              ),
          },
        },
      ],
    }).compileComponents();
    TestBed.overrideComponent(SpotMapComponent, { set: { template: '' } });
    // Two calls: Angular rejects one override that mixes `set` with `add`/`remove`.
    TestBed.overrideComponent(MapComponent, {
      set: { providers: [{ provide: SpotBrowserStore, useValue: store }] },
    });
    TestBed.overrideComponent(MapBannerComponent, {
      remove: { imports: [AsciiAnimationTextComponent] },
      add: { imports: [StubBannerComponent] },
    });
  });

  afterEach(() => fixture?.destroy());

  function create(width = 1200): HTMLElement {
    fixture = TestBed.createComponent(MapComponent);
    const host = fixture.nativeElement as HTMLElement;
    host.style.cssText = `display:block;width:${width}px;height:800px`;
    fixture.detectChanges();
    // A fixture's detectChanges runs no render hooks; the app tick runs the page's body measuring.
    TestBed.tick();
    fixture.detectChanges();
    return host;
  }

  function container(): MapContainerComponent {
    return fixture.debugElement.query(By.directive(MapContainerComponent))
      .componentInstance as MapContainerComponent;
  }

  /** The map the page projects into its frame. */
  function spotMap(): SpotMapComponent {
    return fixture.debugElement.query(By.directive(SpotMapComponent))
      .componentInstance as SpotMapComponent;
  }

  function sheet(): SpotSheetComponent {
    return fixture.debugElement.query(By.directive(SpotSheetComponent))
      .componentInstance as SpotSheetComponent;
  }

  function goNarrow(): void {
    wide.next(false);
    fixture.detectChanges();
    fixture.detectChanges();
  }

  /** The map window's height as the page measured it, which the sheet's heights are shares of. */
  function frameHeight(host: HTMLElement): number {
    return host.querySelector<HTMLElement>('.map-window')!.clientHeight;
  }

  /** The map window's width as the page measured it, which the column's limits derive from. */
  function frameWidth(host: HTMLElement): number {
    return host.querySelector<HTMLElement>('.map-window')!.clientWidth;
  }

  /** Two animation frames: long enough for a ResizeObserver callback to have run. */
  async function nextFrames(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
  }

  /** Renders the page's deferred city picker, as the browser does once the page is idle. */
  async function loadPicker(): Promise<void> {
    for (const block of await fixture.getDeferBlocks()) {
      await block.render(DeferBlockState.Complete);
    }
    fixture.detectChanges();
    // The page learns the picker is in from a view query, which its effect reads on the app tick.
    TestBed.tick();
    fixture.detectChanges();
  }

  /** Waits a frame at a time, rendering, until `done()` holds or two seconds have passed. */
  async function frameUntil(done: () => boolean): Promise<void> {
    const deadline = performance.now() + 2000;
    while (!done() && performance.now() < deadline) {
      await nextFrames();
      fixture.detectChanges();
      TestBed.tick();
    }
  }

  /** Closes the open spot the way the store would: no selection, no detail, and a render. */
  function closeSpot(): void {
    store.selectedId.set(null);
    store.detail.set(null);
    fixture.detectChanges();
    // The render hooks that move focus run on the app tick, not on a fixture's detectChanges.
    TestBed.tick();
    fixture.detectChanges();
  }

  /** Opens `id` as a loading detail, as the store does once the route names it. */
  function showSpot(id: string, preview: SpotListFeature): void {
    store.selectedId.set(id);
    store.detail.set({ status: 'loading', id, preview });
  }

  describe('on a wide screen', () => {
    /** The page gutter from 1024 px (DESIGN.md spacing `lg`). */
    const GUTTER = 24;

    beforeEach(() => localStorage.removeItem(COLUMN_SHARE_STORAGE_KEY));
    afterEach(() => localStorage.removeItem(COLUMN_SHARE_STORAGE_KEY));

    /** The column's laid-out width. */
    function columnWidth(host: HTMLElement): number {
      return host
        .querySelector<HTMLElement>('aside.spot-column')!
        .getBoundingClientRect().width;
    }

    /** The split handle between the map and the column. */
    function handle(): SplitHandleComponent {
      return fixture.debugElement.query(By.directive(SplitHandleComponent))
        .componentInstance as SplitHandleComponent;
    }

    it('puts the banner and the city picker in a header row above the window', async () => {
      const host = create();
      await loadPicker();

      const header = host.querySelector<HTMLElement>('header.map-header');
      expect(header).not.toBeNull();
      expect(header?.querySelector('app-city-picker')).not.toBeNull();
      expect(
        host.querySelector('aside.spot-column app-city-picker'),
      ).toBeNull();
      expect(host.querySelector('.map-topbar')).toBeNull();

      const banner = fixture.debugElement.query(By.css('.map-header__banner'));
      expect(banner).not.toBeNull();
      const stub = fixture.debugElement.query(
        By.css('.map-header__banner app-ascii-animation-text'),
      ).componentInstance as StubBannerComponent;
      expect(stub.fixedFontSize()).toBe(HEADER_BANNER_FONT_PX);
      expect(stub.dotGutters()).toBeFalse();
      expect(stub.messages()[0]).toBe('VIENNA SPOTMAP');
      expect(stub.messages()).toContain('SUPPORTED BY ROLLTROTTEL-VERBAND');

      const bannerBox = (
        banner?.nativeElement as HTMLElement
      ).getBoundingClientRect();
      expect(Math.round(bannerBox.height)).toBe(40);
      expect(Math.round(bannerBox.top - host.getBoundingClientRect().top)).toBe(
        GUTTER,
      );
      expect(
        Math.round(bannerBox.left - host.getBoundingClientRect().left),
      ).toBe(GUTTER);
    });

    it('sets the header row’s city select 40 px tall', async () => {
      const host = create();
      await loadPicker();
      const field = host.querySelector<HTMLElement>(
        '.map-header .mat-mdc-text-field-wrapper',
      );
      expect(field).not.toBeNull();
      expect(Math.round(field!.getBoundingClientRect().height)).toBe(40);
    });

    it('frames the map, the handle and the column in one window inside the gutter', () => {
      const host = create();

      const frame = host.querySelector<HTMLElement>('.map-window');
      expect(frame).not.toBeNull();
      const style = getComputedStyle(frame!);
      expect(style.borderTopLeftRadius).toBe('8px');
      expect(style.borderBottomRightRadius).toBe('8px');
      expect(style.overflow).toBe('hidden');
      expect(style.boxShadow).toContain('0px 0px 24px');

      const box = frame!.getBoundingClientRect();
      const page = host.getBoundingClientRect();
      expect(Math.round(box.left - page.left)).toBe(GUTTER);
      expect(Math.round(page.right - box.right)).toBe(GUTTER);
      expect(Math.round(page.bottom - box.bottom)).toBe(GUTTER);

      const parts = Array.from(frame!.children).map(
        (child) => child.tagName.toLowerCase() + '.' + child.classList[0],
      );
      expect(parts).toEqual([
        'div.map-page__map',
        'app-split-handle.map-window__handle',
        'aside.spot-column',
      ]);
      expect(
        frame!.querySelector('.map-page__map app-map-container'),
      ).not.toBeNull();
      expect(host.querySelector('app-spot-sheet')).toBeNull();
    });

    it('covers none of the framed map and keeps the credits bottom right', () => {
      create();
      expect(spotMap().coveredInsets()).toEqual(NO_INSETS);
      expect(spotMap().attributionCorner()).toBe('bottom-right');
    });

    it('opens the column at its default width while no share is remembered', () => {
      const host = create();
      expect(columnWidth(host)).toBe(DEFAULT_COLUMN_WIDTH_PX);
      expect(handle().columnWidth()).toBe(DEFAULT_COLUMN_WIDTH_PX);
      expect(handle().frameWidth()).toBe(frameWidth(host));
    });

    it('restores the column’s remembered share of the window', () => {
      localStorage.setItem(COLUMN_SHARE_STORAGE_KEY, '0.4');
      const host = create();
      expect(columnWidth(host)).toBe(columnWidthFor(0.4, frameWidth(host)));
    });

    it('follows the handle and remembers the new width as a share of the window', () => {
      const host = create();
      handle().widthChange.emit(500);
      handle().widthCommit.emit();
      fixture.detectChanges();

      expect(columnWidth(host)).toBe(500);
      expect(handle().columnWidth()).toBe(500);
      expect(
        Number(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)),
      ).toBeCloseTo(500 / frameWidth(host), 6);
    });

    it('stores the share once per drag, on its commit, not per move', () => {
      const host = create();
      const stored = spyOn(Storage.prototype, 'setItem').and.callThrough();
      const shareWrites = () =>
        stored.calls
          .allArgs()
          .filter(([key]) => key === COLUMN_SHARE_STORAGE_KEY);

      handle().widthChange.emit(450);
      handle().widthChange.emit(470);
      handle().widthChange.emit(500);
      expect(shareWrites().length).toBe(0);

      handle().widthCommit.emit();
      expect(shareWrites().length).toBe(1);
      expect(Number(shareWrites()[0][1])).toBeCloseTo(
        500 / frameWidth(host),
        6,
      );
    });

    it('stores the share once per key step, through the real handle', () => {
      create();
      const stored = spyOn(Storage.prototype, 'setItem').and.callThrough();
      fixture.nativeElement
        .querySelector('app-split-handle')
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
        );
      expect(
        stored.calls
          .allArgs()
          .filter(([key]) => key === COLUMN_SHARE_STORAGE_KEY).length,
      ).toBe(1);
    });

    it('holds no transitionend listener on the column', () => {
      const listening = spyOn(
        EventTarget.prototype,
        'addEventListener',
      ).and.callThrough();
      const host = create();
      const column = host.querySelector('aside.spot-column');
      expect(
        listening.calls
          .all()
          .filter(
            (call) =>
              call.object === column && call.args[0] === 'transitionend',
          ),
      ).toEqual([]);
    });

    it('keeps the column’s share when the window is resized', async () => {
      localStorage.setItem(COLUMN_SHARE_STORAGE_KEY, '0.4');
      const host = create();

      host.style.width = '1500px';
      await nextFrames();
      fixture.detectChanges();

      expect(frameWidth(host)).toBe(1500 - 2 * GUTTER);
      expect(handle().frameWidth()).toBe(1500 - 2 * GUTTER);
      expect(columnWidth(host)).toBe(columnWidthFor(0.4, frameWidth(host)));
    });

    it('eases the column back to its default on the handle’s reset and forgets the share', fakeAsync(() => {
      localStorage.setItem(COLUMN_SHARE_STORAGE_KEY, '0.4');
      const host = create();
      const column = host.querySelector<HTMLElement>('aside.spot-column')!;

      handle().widthReset.emit();
      fixture.detectChanges();

      expect(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)).toBeNull();
      expect(column.classList).toContain('spot-column--easing');
      expect(getComputedStyle(column).transitionProperty).toBe('width');
      expect(column.style.width).toBe(`${DEFAULT_COLUMN_WIDTH_PX}px`);

      tick(COLUMN_RESET_EASE_MS + 50);
      fixture.detectChanges();
      expect(column.classList).not.toContain('spot-column--easing');
    }));

    it('resets the column at once under reduced motion', () => {
      spyOn(window, 'matchMedia').and.callFake(
        (query: string) =>
          ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
          }) as MediaQueryList,
      );
      localStorage.setItem(COLUMN_SHARE_STORAGE_KEY, '0.4');
      const host = create();
      const column = host.querySelector<HTMLElement>('aside.spot-column')!;

      handle().widthReset.emit();
      fixture.detectChanges();

      expect(column.classList).not.toContain('spot-column--easing');
      expect(columnWidth(host)).toBe(DEFAULT_COLUMN_WIDTH_PX);
    });

    it('holds the count and the list in the column, under a fixed 64 px toolbar', () => {
      store.shownSpots.set([ALPHA, BETA]);
      const host = create();

      const column = host.querySelector('aside.spot-column')!;
      const toolbar = column.querySelector<HTMLElement>(
        '.spot-column__toolbar',
      );
      expect(toolbar).not.toBeNull();
      expect(toolbar!.textContent).toContain('> 2 SPOTS IN VIEW');
      expect(toolbar!.textContent).toContain('A–Z');
      expect(column.querySelector('.spot-pane app-spot-list')).not.toBeNull();

      const style = getComputedStyle(toolbar!);
      expect(toolbar!.getBoundingClientRect().height).toBe(64);
      expect([
        style.paddingTop,
        style.paddingRight,
        style.paddingBottom,
        style.paddingLeft,
      ]).toEqual(['16px', '16px', '16px', '16px']);
      // The rule is drawn over the row's last pixel row, not as a border that takes layout space.
      expect(style.borderBottomWidth).toBe('0px');
      const rule = getComputedStyle(toolbar!, '::after');
      expect([rule.position, rule.bottom, rule.left, rule.right]).toEqual([
        'absolute',
        '0px',
        '0px',
        '0px',
      ]);
      expect(rule.height).toBe('1px');
      expect(rule.backgroundColor).toBe(
        painted('background-color', 'var(--color-line)'),
      );
      // The toolbar never scrolls: it sits beside the pane, not inside it.
      expect(toolbar!.closest('.spot-pane')).toBeNull();
    });

    it('keeps the toolbar content 16 px from the row’s top and bottom edges, in the list and the detail state', () => {
      store.shownSpots.set([ALPHA, BETA]);
      const host = create();
      const toolbar = host.querySelector<HTMLElement>('.spot-column__toolbar')!;
      const gaps = (content: Element) => {
        const row = toolbar.getBoundingClientRect();
        const box = content.getBoundingClientRect();
        return {
          top: box.top - row.top,
          bottom: row.bottom - box.bottom,
          height: box.height,
        };
      };
      const expected = { top: 16, bottom: 16, height: 32 };

      const listContent = toolbar.querySelector('.spot-column__count-content')!;
      expect(gaps(listContent)).withContext('list state').toEqual(expected);

      showSpot('a', ALPHA);
      fixture.detectChanges();
      const back = toolbar.querySelector('app-overview-back button')!;
      expect(gaps(back.closest('.spot-column__count-content')!))
        .withContext('detail state cell')
        .toEqual(expected);
      expect(gaps(back)).withContext('back plate').toEqual(expected);
    });

    it('does not move the pane: it starts at the toolbar’s bottom edge', () => {
      store.shownSpots.set([ALPHA]);
      const host = create();

      const toolbar = host.querySelector('.spot-column__toolbar')!;
      const pane = host.querySelector('aside.spot-column .spot-pane')!;
      expect(pane.getBoundingClientRect().top).toBe(
        toolbar.getBoundingClientRect().bottom,
      );
    });

    it('pads the list 8 px so its rows’ content sits 16 px in from the column edge', () => {
      store.shownSpots.set([ALPHA]);
      const host = create();

      const list = host.querySelector<HTMLElement>(
        'aside.spot-column app-spot-list',
      )!;
      expect(list.classList).toContain('spot-pane__view--list');
      const style = getComputedStyle(list);
      expect([style.paddingLeft, style.paddingRight]).toEqual(['8px', '8px']);
    });

    it('lets the detail pad itself: the pane adds no padding round it', () => {
      showSpot('a', ALPHA);
      const host = create();

      const detail = host.querySelector<HTMLElement>(
        'aside.spot-column app-spot-detail',
      )!;
      expect(detail.classList).not.toContain('spot-pane__view--list');
    });

    it('says one spot in the singular and shows a loading line before the count is known', () => {
      const host = create();
      const count = () =>
        host.querySelector('.spot-column__toolbar')!.textContent!;
      expect(count()).toContain('> LOADING SPOTS…');

      store.shownSpots.set([ALPHA]);
      fixture.detectChanges();
      expect(count()).toContain('> 1 SPOT IN VIEW');
    });

    it('turns the count into the < OVERVIEW plate, 32 px drawn and 44 px to the touch, while a spot is open', () => {
      store.shownSpots.set([ALPHA, BETA]);
      showSpot('a', ALPHA);
      const host = create();

      const back = host.querySelector<HTMLButtonElement>(
        '.spot-column__toolbar app-overview-back button',
      )!;
      expect(back.textContent!.trim()).toBe('< OVERVIEW');
      expect(back.getAttribute('aria-label')).toBe(
        'Overview, back to the list',
      );
      expect(back.classList).toContain('phosphor-bloom--plate');
      expect(back.getBoundingClientRect().height).toBe(32);
      const hit = getComputedStyle(back, '::after');
      expect([hit.position, hit.top, hit.bottom]).toEqual([
        'absolute',
        '-7px',
        '-7px',
      ]);

      back.click();
      expect(store.close).toHaveBeenCalledTimes(1);
      expect(host.querySelector('app-spot-detail')).not.toBeNull();
    });

    it('words the back plate the same whether or not the count is known', () => {
      showSpot('a', ALPHA);
      const host = create();
      const back = () =>
        host.querySelector<HTMLButtonElement>(
          '.spot-column__toolbar app-overview-back button',
        )!;
      expect(back().textContent!.trim()).toBe('< OVERVIEW');
      store.shownSpots.set([ALPHA, BETA]);
      fixture.detectChanges();
      expect(back().textContent!.trim()).toBe('< OVERVIEW');
    });

    it('crossfades the count and the back button in one shared cell instead of cutting', () => {
      store.shownSpots.set([ALPHA, BETA]);
      const host = create();
      const toolbar = host.querySelector('.spot-column__toolbar')!;
      const contentOf = (selector: string) =>
        toolbar.querySelector(selector)!.closest('.spot-column__count-content');

      // Specs run with animations off, so the fade-out is shown by the class the leave applies.
      for (const [selector, open] of [
        ['.spot-column__count-line', false],
        ['app-overview-back', true],
      ] as const) {
        if (open) {
          showSpot('a', ALPHA);
          fixture.detectChanges();
        }
        const content = contentOf(selector)!;
        expect(content).withContext(selector).not.toBeNull();
        const style = getComputedStyle(content);
        expect(style.transitionProperty).toBe('opacity');
        expect([style.gridRowStart, style.gridColumnStart]).toEqual(['1', '1']);
        content.classList.add('spot-column__count-content--leaving');
        expect(getComputedStyle(content).opacity).toBe('0');
      }
    });
  });

  describe('on a phone', () => {
    beforeEach(() => {
      wide.next(false);
      phone.next(true);
    });

    /** The gutter round the framed map below 1024 px (DESIGN.md spacing `md`). */
    const GUTTER = 16;

    it('frames the map below the top bar and 16 px in from the sides and the bottom, with the sheet inside it', () => {
      const host = create(390);

      const frame = host.querySelector<HTMLElement>('.map-window')!;
      const style = getComputedStyle(frame);
      expect(style.borderTopLeftRadius).toBe('8px');
      expect(style.overflow).toBe('hidden');
      expect(style.boxShadow).toContain('0px 0px 24px');

      const box = frame.getBoundingClientRect();
      const page = host.getBoundingClientRect();
      const bar = host.querySelector<HTMLElement>('.map-topbar')!;
      // The bar's own 16 px bottom padding is the gutter above the window.
      expect(getComputedStyle(bar).paddingBottom).toBe('16px');
      expect(Math.round(box.top - bar.getBoundingClientRect().bottom)).toBe(0);
      expect(Math.round(box.left - page.left)).toBe(GUTTER);
      expect(Math.round(page.right - box.right)).toBe(GUTTER);
      expect(Math.round(page.bottom - box.bottom)).toBe(GUTTER);

      const sheetHost = host.querySelector<HTMLElement>('app-spot-sheet')!;
      expect(frame.contains(sheetHost)).toBeTrue();
      const sheetBox = sheetHost.getBoundingClientRect();
      expect(Math.round(sheetBox.left)).toBe(Math.round(box.left));
      expect(Math.round(sheetBox.right)).toBe(Math.round(box.right));
      expect(Math.round(sheetBox.bottom)).toBe(Math.round(box.bottom));
    });

    it('caps the open sheet at half the framed map, list and detail alike', () => {
      const host = create(390);
      const half = Math.round(frameHeight(host) * 0.5);
      expect(sheet().availableHeight()).toBe(frameHeight(host));

      sheet().headTap.emit();
      fixture.detectChanges();
      expect(sheet().state()).toBe('list');
      expect(spotMap().coveredInsets().bottom).toBe(half);

      showSpot('a', ALPHA);
      fixture.detectChanges();
      expect(sheet().state()).toBe('detail');
      expect(spotMap().coveredInsets().bottom).toBe(half);
      // The sheet eases its height (330 ms); settle it to read where it comes to rest.
      const sheetHost = host.querySelector<HTMLElement>('app-spot-sheet')!;
      sheetHost.getAnimations().forEach((animation) => animation.finish());
      expect(Math.round(sheetHost.getBoundingClientRect().height)).toBe(half);
    });

    it('puts a slim top bar over the map and the sheet under it', async () => {
      const host = create();
      await loadPicker();
      expect(host.querySelector('.map-topbar app-city-picker')).not.toBeNull();
      expect(host.querySelector('app-spot-sheet app-spot-list')).not.toBeNull();
      expect(host.querySelector('aside.spot-column')).toBeNull();
    });

    it('tells the map the sheet covers its bottom, and keeps the credits top right', () => {
      const host = create();
      expect(spotMap().coveredInsets()).toEqual({
        ...NO_INSETS,
        bottom: sheetHeight('peek', frameHeight(host)),
      });
      expect(spotMap().attributionCorner()).toBe('top-right');
    });

    it('opens the list from the sheet head and covers more of the map', () => {
      const host = create();
      sheet().headTap.emit();
      fixture.detectChanges();

      expect(sheet().state()).toBe('list');
      expect(spotMap().coveredInsets().bottom).toBe(
        sheetHeight('list', frameHeight(host)),
      );
    });

    it('opens the sheet to the detail when a spot is selected, and back to where it was when it closes elsewhere', () => {
      create();
      store.selectedId.set('a');
      store.detail.set({ status: 'loading', id: 'a', preview: ALPHA });
      fixture.detectChanges();
      expect(sheet().state()).toBe('detail');

      store.selectedId.set(null);
      store.detail.set(null);
      fixture.detectChanges();
      expect(sheet().state()).toBe('peek');
    });

    it('opens on the detail for a spot already selected when the page starts (a shared link)', () => {
      store.selectedId.set('a');
      store.detail.set({ status: 'loading', id: 'a', preview: null });
      create();
      expect(sheet().state()).toBe('detail');
    });

    it('goes back to the list from the sheet, closing the spot', () => {
      store.selectedId.set('a');
      store.detail.set({ status: 'loading', id: 'a', preview: ALPHA });
      create();

      sheet().back.emit();
      fixture.detectChanges();
      expect(store.close).toHaveBeenCalledTimes(1);
      expect(sheet().state()).toBe('list');

      store.selectedId.set(null);
      store.detail.set(null);
      fixture.detectChanges();
      expect(sheet().state()).toBe('list');
    });

    it('closes the spot to the peek bar from the sheet', () => {
      store.selectedId.set('a');
      store.detail.set({ status: 'loading', id: 'a', preview: ALPHA });
      create();

      sheet().close.emit();
      fixture.detectChanges();
      expect(store.close).toHaveBeenCalledTimes(1);
      expect(sheet().state()).toBe('peek');
    });

    it('closes an open spot on a tap on empty map', () => {
      store.selectedId.set('a');
      store.detail.set({ status: 'loading', id: 'a', preview: ALPHA });
      create();

      spotMap().emptyClick.emit();
      fixture.detectChanges();
      expect(store.close).toHaveBeenCalledTimes(1);
      expect(sheet().state()).toBe('peek');
    });

    it('ignores a tap on empty map while no spot is open', () => {
      create();
      spotMap().emptyClick.emit();
      expect(store.close).not.toHaveBeenCalled();
    });

    it('opens the sheet to the list to show the not-found notice', () => {
      create();
      store.notice.set('not-found');
      fixture.detectChanges();
      expect(sheet().state()).toBe('list');
    });

    it('leaves the sheet and the map alone when a second close arrives before the route has changed', () => {
      showSpot('a', ALPHA);
      create();

      sheet().close.emit();
      sheet().close.emit();
      fixture.detectChanges();

      expect(store.close).toHaveBeenCalledTimes(2);
      expect(sheet().state()).toBe('peek');
    });

    describe('the top bar', () => {
      /** The bar's padding on every side (DESIGN.md spacing `md`), the safe-area inset aside. */
      const BAR_PADDING = 16;
      /** The phone widths the bar has to work at, from the narrowest to a large phone. */
      const PHONE_WIDTHS = [320, 360, 390];

      // Two specs render the bar once per city, which grows with the city list and with how slowly
      // a CI runner paints: Jasmine's 5 s default cut one off mid-loop, and the unfinished loop
      // then failed the next spec against a destroyed fixture.
      const defaultTimeoutMs = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      beforeAll(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 30_000;
      });
      afterAll(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = defaultTimeoutMs;
      });

      /** The label the closed select shows for `entry`. */
      const labelOf = (entry: MapItem) =>
        `${entry.city} · ${entry.countryCode}`;

      /** The banner in the top bar. */
      function topbarBanner(): StubBannerComponent {
        return fixture.debugElement.query(
          By.css('.map-topbar__banner app-ascii-animation-text'),
        ).componentInstance as StubBannerComponent;
      }

      /** The bar's width inside its padding: what each of its two rows spans. */
      function barContentWidth(host: HTMLElement): number {
        return (
          host.querySelector<HTMLElement>('.map-topbar')!.clientWidth -
          2 * BAR_PADDING
        );
      }

      /** Creates the page at a phone width, once the bar's first measurement has landed. */
      async function createPhone(width: number): Promise<HTMLElement> {
        const host = create(width);
        await nextFrames();
        fixture.detectChanges();
        await loadPicker();
        return host;
      }

      it('pads the bar 16 px on every side and sets the city select 40 px tall', async () => {
        const host = await createPhone(360);
        const bar = host.querySelector<HTMLElement>('.map-topbar')!;
        const style = getComputedStyle(bar);
        expect([
          style.paddingTop,
          style.paddingRight,
          style.paddingBottom,
          style.paddingLeft,
        ]).toEqual(['16px', '16px', '16px', '16px']);

        const field = host.querySelector<HTMLElement>(
          '.map-topbar .mat-mdc-text-field-wrapper',
        )!;
        expect(Math.round(field.getBoundingClientRect().height)).toBe(40);
        expect(host.querySelector('.map-header')).toBeNull();
      });

      it('starts the banner on its resting line, set in the bar’s small size', async () => {
        await createPhone(360);
        expect(topbarBanner().messages()[0]).toBe(RESTING_BANNER_LINE);
        expect(topbarBanner().fixedFontSize()).toBe(TOPBAR_BANNER_FONT_PX);
        expect(topbarBanner().dotGutters()).toBeFalse();
      });

      it('stacks a 24 px banner row over a 40 px picker row, 8 px apart, each as wide as the bar’s content', async () => {
        const host = await createPhone(390);
        const banner = host.querySelector<HTMLElement>('.map-topbar__banner')!;
        const picker = host.querySelector<HTMLElement>('.map-topbar__picker')!;
        const bannerBox = banner.getBoundingClientRect();
        const pickerBox = picker.getBoundingClientRect();
        expect(bannerBox.width).toBeCloseTo(barContentWidth(host), 0);
        expect(bannerBox.height).toBe(24);
        expect(pickerBox.width).toBeCloseTo(barContentWidth(host), 0);
        expect(pickerBox.top - bannerBox.bottom).toBeCloseTo(8, 0);
        expect(
          host
            .querySelector<HTMLElement>('.map-topbar')!
            .getBoundingClientRect().height,
        ).toBe(104);
      });

      it('sizes neither row by the line playing or the city chosen', async () => {
        const host = await createPhone(390);
        const banner = host.querySelector<HTMLElement>('.map-topbar__banner')!;
        const picker = host.querySelector<HTMLElement>('.map-topbar__picker')!;
        expect(banner.style.width).toBe('');
        expect(picker.style.minWidth).toBe('');
        const widths = new Set<string>();
        for (const entry of Object.values(SUPPORTED_CITIES)) {
          store.city.set(entry);
          fixture.detectChanges();
          await nextFrames();
          fixture.detectChanges();
          // Queried afresh: the city's own line changes the banner's lines, which recreates it.
          const row = (selector: string) =>
            host.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
              .width;
          widths.add(
            `${row('.map-topbar__banner')}/${row('.map-topbar__picker')}`,
          );
        }
        expect(widths.size).withContext('row widths per city').toBe(1);
      });

      for (const width of PHONE_WIDTHS) {
        it(`offers every banner line at ${width} px, the longest house line included`, async () => {
          store.city.set(SUPPORTED_CITIES[CityEnum.Bratislava]);
          const host = await createPhone(width);
          const lines = topbarBanner().messages();
          expect(lines).toContain('SUPPORTED BY ROLLTROTTEL-VERBAND');
          expect(lines).toContain('BRATISLAVA SPOTMAP');
          for (const line of lines) {
            expect(bannerLineWidth(line, TOPBAR_BANNER_FONT_PX))
              .withContext(line)
              .toBeLessThanOrEqual(barContentWidth(host));
          }
        });
      }

      it('skips only the lines wider than the bar, on a screen narrower than the longest line needs', async () => {
        await createPhone(300);
        expect(topbarBanner().messages()).not.toContain(
          'SUPPORTED BY ROLLTROTTEL-VERBAND',
        );
        expect(topbarBanner().messages()).toContain(RESTING_BANNER_LINE);
      });

      it('shows every city’s label in full at 320 px, with no ellipsis on the chosen city', async () => {
        const host = await createPhone(320);
        const bar = host.querySelector<HTMLElement>('.map-topbar')!;
        const picker = host.querySelector<HTMLElement>('.map-topbar__picker')!;
        const value = host.querySelector<HTMLElement>(
          '.map-topbar .mat-mdc-select-value',
        )!;

        for (const entry of Object.values(SUPPORTED_CITIES)) {
          store.city.set(entry);
          fixture.detectChanges();
          await fixture.whenStable();
          await nextFrames();
          fixture.detectChanges();
          expect(value.scrollWidth)
            .withContext(labelOf(entry))
            .toBeLessThanOrEqual(value.clientWidth);
          expect(picker.getBoundingClientRect().right)
            .withContext(labelOf(entry))
            .toBeLessThanOrEqual(
              bar.getBoundingClientRect().right - BAR_PADDING + 0.5,
            );
        }
        expect(
          parseFloat(getComputedStyle(value).fontSize),
        ).toBeGreaterThanOrEqual(12);
      });
    });
  });

  describe('on a tablet', () => {
    /** The gutter round the header row and the framed map below 1024 px. */
    const GUTTER = 16;

    beforeEach(() => {
      wide.next(false);
      phone.next(false);
    });

    it('puts the wide header row over the framed map and the sheet, inside a 16 px gutter', async () => {
      const host = create(900);
      await loadPicker();
      expect(host.querySelector('.map-topbar')).toBeNull();
      expect(host.querySelector('aside.spot-column')).toBeNull();

      const banner = fixture.debugElement.query(By.css('.map-header__banner'));
      expect(banner).not.toBeNull();
      const stub = fixture.debugElement.query(
        By.css('.map-header__banner app-ascii-animation-text'),
      ).componentInstance as StubBannerComponent;
      expect(stub.fixedFontSize()).toBe(HEADER_BANNER_FONT_PX);
      expect(stub.dotGutters()).toBeFalse();
      expect(stub.messages()[0]).toBe('VIENNA SPOTMAP');
      expect(host.querySelector('.map-header app-city-picker')).not.toBeNull();

      const page = host.getBoundingClientRect();
      const bannerBox = (
        banner.nativeElement as HTMLElement
      ).getBoundingClientRect();
      expect(Math.round(bannerBox.top - page.top)).toBe(GUTTER);
      expect(Math.round(bannerBox.left - page.left)).toBe(GUTTER);

      const frame = host.querySelector<HTMLElement>('.map-window')!;
      const box = frame.getBoundingClientRect();
      expect(getComputedStyle(frame).borderTopLeftRadius).toBe('8px');
      expect(Math.round(box.left - page.left)).toBe(GUTTER);
      expect(Math.round(page.right - box.right)).toBe(GUTTER);
      expect(Math.round(page.bottom - box.bottom)).toBe(GUTTER);
      expect(frame.querySelector('app-spot-sheet')).not.toBeNull();
    });

    it('covers the framed map by the sheet and keeps the credits top right', () => {
      const host = create(900);
      expect(spotMap().coveredInsets()).toEqual({
        ...NO_INSETS,
        bottom: sheetHeight('peek', frameHeight(host)),
      });
      expect(spotMap().attributionCorner()).toBe('top-right');
    });
  });

  describe('keyboard focus when a spot closes', () => {
    it('lands on the count line on a wide screen when no row opened the spot', () => {
      store.shownSpots.set([ALPHA, BETA]);
      showSpot('a', ALPHA);
      const host = create();
      host
        .querySelector<HTMLButtonElement>(
          '.spot-column__toolbar app-overview-back button',
        )!
        .focus();

      closeSpot();

      expect(document.activeElement).toBe(
        host.querySelector('.spot-column__count-line'),
      );
    });

    it('returns to the row that opened the spot when that row can take it', () => {
      store.shownSpots.set([ALPHA, BETA]);
      store.returnFocusTo.set('b');
      showSpot('b', BETA);
      const host = create();
      host
        .querySelector<HTMLButtonElement>(
          '.spot-column__toolbar app-overview-back button',
        )!
        .focus();

      closeSpot();

      expect(document.activeElement).toBe(
        host.querySelector('a[data-spot-id="b"]'),
      );
    });

    it('lands on the sheet head on a phone when ✕ closes a spot a row opened, as the rows are out of reach at the peek bar', () => {
      wide.next(false);
      store.shownSpots.set([ALPHA, BETA]);
      store.returnFocusTo.set('a');
      showSpot('a', ALPHA);
      const host = create();
      host.querySelector<HTMLButtonElement>('.spot-sheet__close')!.focus();

      sheet().close.emit();
      closeSpot();

      expect(document.activeElement).toBe(
        host.querySelector('.spot-sheet__toggle'),
      );
    });

    it('lands on the sheet head on a phone when the way back to the list closes a pin-opened spot', () => {
      wide.next(false);
      store.shownSpots.set([ALPHA, BETA]);
      showSpot('a', ALPHA);
      const host = create();
      host
        .querySelector<HTMLButtonElement>(
          'app-spot-sheet app-overview-back button',
        )!
        .focus();

      sheet().back.emit();
      closeSpot();

      expect(document.activeElement).toBe(
        host.querySelector('.spot-sheet__toggle'),
      );
    });

    it('leaves focus where the visitor put it when it was not in the spot', async () => {
      store.shownSpots.set([ALPHA, BETA]);
      showSpot('a', ALPHA);
      const host = create();
      await loadPicker();
      const picker = host.querySelector<HTMLElement>('.map-header mat-select')!;
      picker.focus();
      expect(document.activeElement).toBe(picker);

      closeSpot();

      expect(document.activeElement).toBe(picker);
    });
  });

  describe('the mounted list', () => {
    const list = () =>
      fixture.nativeElement.querySelector(
        'app-spot-list',
      ) as HTMLElement | null;

    /** Enough rows to scroll the column. */
    const MANY = Array.from({ length: 60 }, (_, index) =>
      listFeature(`s${index}`, `Spot ${index}`),
    );

    function open(id: string, preview: SpotListFeature): void {
      showSpot(id, preview);
      fixture.detectChanges();
      TestBed.tick();
      fixture.detectChanges();
    }

    it('keeps the same list through an open and close when the rows are unchanged', () => {
      store.shownSpots.set([ALPHA, BETA]);
      create();
      const before = list();
      open('a', ALPHA);
      expect(list()).toBe(before);
      closeSpot();
      expect(list()).toBe(before);
    });

    it('replaces the list on a close whose rows changed', () => {
      store.shownSpots.set([ALPHA, BETA]);
      create();
      const before = list();
      open('a', ALPHA);
      store.selectedId.set(null);
      store.detail.set(null);
      store.shownSpots.set([BETA]);
      fixture.detectChanges();
      TestBed.tick();
      expect(list()).not.toBe(before);
    });

    it('needs no new list when the rows changed while a spot was open', () => {
      store.shownSpots.set([ALPHA, BETA]);
      create();
      const before = list();
      open('a', ALPHA);
      store.shownSpots.set(null);
      fixture.detectChanges();
      store.shownSpots.set([BETA]);
      fixture.detectChanges();
      closeSpot();
      expect(list()).toBe(before);
    });

    it('makes the list inert and hidden from screen readers while a spot is open, and neither after', () => {
      store.shownSpots.set([ALPHA, BETA]);
      create();
      expect(list()!.inert).toBeFalse();
      expect(list()!.getAttribute('aria-hidden')).toBeNull();
      expect(list()!.classList).not.toContain('spot-pane__view--list-hidden');

      open('a', ALPHA);
      expect(list()!.inert).toBeTrue();
      expect(list()!.getAttribute('aria-hidden')).toBe('true');
      expect(list()!.classList).toContain('spot-pane__view--list-hidden');

      closeSpot();
      expect(list()!.inert).toBeFalse();
      expect(list()!.getAttribute('aria-hidden')).toBeNull();
      expect(list()!.classList).not.toContain('spot-pane__view--list-hidden');
    });

    it('keeps the list’s scroll position through an open and close when the rows are unchanged', () => {
      store.shownSpots.set(MANY);
      create();
      list()!.scrollTop = 200;
      expect(list()!.scrollTop).toBe(200);
      open('s0', MANY[0]);
      closeSpot();
      expect(list()!.scrollTop).toBe(200);
    });

    it('returns focus to the same row on every close: A, close, A, close', () => {
      store.shownSpots.set([ALPHA, BETA]);
      create();
      const rowA = () =>
        fixture.nativeElement.querySelector('a[data-spot-id="a"]');
      for (const pass of ['first', 'second']) {
        store.returnFocusTo.set('a');
        open('a', ALPHA);
        fixture.nativeElement
          .querySelector('.spot-column__toolbar app-overview-back button')
          .focus();
        closeSpot();
        expect(document.activeElement).withContext(pass).toBe(rowA());
      }
    });

    it('asks the list to focus nothing while a spot is open', () => {
      store.shownSpots.set([ALPHA]);
      store.returnFocusTo.set('a');
      create();
      const component = fixture.debugElement.query(
        By.directive(SpotListComponent),
      ).componentInstance as SpotListComponent;
      expect(component.focusId()).toBe('a');
      open('a', ALPHA);
      expect(component.focusId()).toBeNull();
    });

    it('counts a row in the hidden list as lost focus when the spot closes', () => {
      store.shownSpots.set([ALPHA, BETA]);
      const host = create();
      host.querySelector<HTMLElement>('a[data-spot-id="b"]')!.focus();
      open('a', ALPHA);
      closeSpot();
      expect(document.activeElement).toBe(
        host.querySelector('.spot-column__count-line'),
      );
    });

    it('builds no list on a cold link until its first close, then keeps it', () => {
      store.shownSpots.set([ALPHA]);
      showSpot('a', ALPHA);
      const host = create();
      expect(list()).toBeNull();
      expect(host.querySelector('img')).toBeNull();
      closeSpot();
      const mounted = list();
      expect(mounted).not.toBeNull();
      open('a', ALPHA);
      expect(list()).toBe(mounted);
    });

    it('keeps the list ahead of the detail, so Tab from the opening row reaches the detail', () => {
      store.shownSpots.set([ALPHA]);
      create();
      open('a', ALPHA);
      const detail = fixture.nativeElement.querySelector('app-spot-detail');
      expect(
        list()!.compareDocumentPosition(detail) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('leaves toward −8 px, net of the 16 px step that waits out the fade', () => {
      store.shownSpots.set([ALPHA]);
      create();
      open('a', ALPHA);
      const style = getComputedStyle(list()!);
      expect(style.transitionProperty).toContain('translate');
      expect(style.transitionProperty).toContain('transform');
      expect(style.pointerEvents).toBe('none');
      list()!
        .getAnimations()
        .forEach((animation) => animation.finish());
      expect(getComputedStyle(list()!).opacity).toBe('0');
      expect(getComputedStyle(list()!).translate).toBe('16px');
      expect(getComputedStyle(list()!).transform).toBe(
        'matrix(1, 0, 0, 1, -8, 0)',
      );
    });
  });

  describe('the deferred city picker', () => {
    /** The two picker slots: the header row's from 769 px, the top bar's on a phone. */
    const SITES = [
      {
        name: 'the header row',
        slot: '.map-header__picker',
        width: 1200,
        wide: true,
        phone: false,
      },
      {
        name: 'the top bar',
        slot: '.map-topbar__picker',
        width: 390,
        wide: false,
        phone: true,
      },
    ] as const;

    /** A box's position and size in whole px, for before/after comparisons. */
    function boxOf(element: Element): string {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x, y, width, height].map((n) => Math.round(n)).join(',');
    }

    /** The box the text inside `element` paints, transforms included. */
    function textBox(element: Element): DOMRect {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect();
    }

    /** Expects two boxes to agree within `tolerance` px on every edge. */
    function expectSameBox(
      actual: DOMRect,
      expected: DOMRect,
      what: string,
      tolerance = 1,
    ): void {
      for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
        expect(Math.abs(actual[edge] - expected[edge]))
          .withContext(`${what} ${edge}: ${actual[edge]} vs ${expected[edge]}`)
          .toBeLessThanOrEqual(tolerance);
      }
    }

    for (const site of SITES) {
      describe(`in ${site.name}`, () => {
        beforeEach(() => {
          wide.next(site.wide);
          phone.next(site.phone);
        });

        /** The page at this site's width, once the top bar's first measurement has landed. */
        async function createSite(): Promise<HTMLElement> {
          const host = create(site.width);
          await nextFrames();
          fixture.detectChanges();
          return host;
        }

        it('holds the slot with an inert, hidden 40 px placeholder until the picker loads', async () => {
          const host = await createSite();
          const slot = host.querySelector<HTMLElement>(site.slot)!;
          const placeholder =
            slot.querySelector<HTMLElement>('.city-placeholder');
          expect(placeholder).not.toBeNull();
          expect(slot.querySelector('app-city-picker')).toBeNull();
          expect(placeholder!.getAttribute('aria-hidden')).toBe('true');
          expect(getComputedStyle(placeholder!).pointerEvents).toBe('none');
          expect(
            slot.querySelectorAll(
              'a, button, input, select, textarea, [tabindex]',
            ).length,
          ).toBe(0);
          expect(placeholder!.textContent!.trim()).toBe('City');
          expect(Math.round(slot.getBoundingClientRect().height)).toBe(40);
        });

        it('swaps the placeholder for the picker without moving or resizing anything', async () => {
          const host = await createSite();
          const banner = site.phone
            ? '.map-topbar__banner'
            : '.map-header__banner';
          const watched = [site.slot, banner, '.map-window'];
          const before = watched.map((selector) =>
            boxOf(host.querySelector(selector)!),
          );

          await loadPicker();
          await nextFrames();
          fixture.detectChanges();

          expect(
            watched.map((selector) => boxOf(host.querySelector(selector)!)),
          ).toEqual(before);
          expect(
            host.querySelectorAll(`${site.slot} app-city-picker`).length,
          ).toBe(1);
        });

        it('draws the placeholder as the closed field’s outline, notch and floating label', async () => {
          const host = await createSite();
          const slot = host.querySelector<HTMLElement>(site.slot)!;
          const frame = slot.querySelector<HTMLElement>('.city-placeholder')!;
          const legend = slot.querySelector<HTMLElement>(
            '.city-placeholder__label',
          )!;
          const frameStyle = getComputedStyle(frame);
          const legendStyle = getComputedStyle(legend);
          const placeholder = {
            frame: frame.getBoundingClientRect(),
            notch: legend.getBoundingClientRect(),
            text: textBox(legend),
            borderColor: frameStyle.borderTopColor,
            radius: frameStyle.borderTopLeftRadius,
            color: legendStyle.color,
            glow: legendStyle.textShadow,
            font: legendStyle.fontFamily,
          };

          await loadPicker();
          await nextFrames();
          fixture.detectChanges();

          const outline = slot.querySelector<HTMLElement>(
            '.mdc-notched-outline',
          )!;
          const notch = slot.querySelector<HTMLElement>(
            '.mdc-notched-outline__notch',
          )!;
          const trailing = slot.querySelector<HTMLElement>(
            '.mdc-notched-outline__trailing',
          )!;
          const label = slot.querySelector<HTMLElement>(
            '.mat-mdc-floating-label',
          )!;
          const edge = getComputedStyle(
            slot.querySelector('.mdc-notched-outline__leading')!,
          );
          const labelStyle = getComputedStyle(label);

          expectSameBox(
            placeholder.frame,
            outline.getBoundingClientRect(),
            'frame',
          );
          expect(
            Math.abs(
              placeholder.notch.left - notch.getBoundingClientRect().left,
            ),
          )
            .withContext('notch start')
            .toBeLessThanOrEqual(1);
          expect(
            Math.abs(
              placeholder.notch.right - trailing.getBoundingClientRect().left,
            ),
          )
            .withContext('notch end')
            .toBeLessThanOrEqual(1);
          // The specs render in the fallback font, not the app's, and the label's line box differs
          // by up to a pixel and a half between them (the placeholder's offset is tuned in the real
          // app), so the text box gets 2 px where the frame and notch get 1.
          expectSameBox(placeholder.text, textBox(label), 'label text', 2);
          expect(placeholder.borderColor).toBe(edge.borderTopColor);
          expect(placeholder.radius).toBe(edge.borderTopLeftRadius);
          expect(placeholder.color).toBe(labelStyle.color);
          expect(placeholder.glow).toBe(labelStyle.textShadow);
          expect(placeholder.font).toBe(labelStyle.fontFamily);
        });
      });
    }

    it('keeps the placeholder in a layout built before the picker has loaded', () => {
      const host = create();
      wide.next(false);
      phone.next(true);
      fixture.detectChanges();
      fixture.detectChanges();
      expect(
        host.querySelector('.map-topbar__picker .city-placeholder'),
      ).not.toBeNull();
      expect(host.querySelector('app-city-picker')).toBeNull();
    });

    describe('with its real triggers', () => {
      beforeAll(() => (deferBehavior = DeferBlockBehavior.Playthrough));
      afterAll(() => (deferBehavior = DeferBlockBehavior.Manual));

      it('loads once the page is idle, then the placeholder fades out', async () => {
        const host = create();
        expect(
          host.querySelector('.map-header .city-placeholder'),
        ).not.toBeNull();

        await frameUntil(
          () => host.querySelector('.map-header app-city-picker') !== null,
        );
        expect(
          host.querySelector('.map-header app-city-picker'),
        ).not.toBeNull();

        await frameUntil(
          () => host.querySelector('.city-placeholder') === null,
        );
        expect(host.querySelector('.city-placeholder')).toBeNull();
      });

      it('shows the picker at once, and no placeholder, in a layout built after it has loaded', async () => {
        const host = create();
        await frameUntil(
          () => host.querySelector('.city-placeholder') === null,
        );
        expect(
          host.querySelector('.map-header app-city-picker'),
        ).not.toBeNull();

        wide.next(false);
        phone.next(true);
        fixture.detectChanges();
        fixture.detectChanges();
        // No placeholder in the passes that built the bar, and the slot already holds the field's
        // 40 px; only the picker itself takes a microtask, its code being in already.
        expect(host.querySelector('.city-placeholder')).toBeNull();
        expect(
          Math.round(
            host.querySelector('.map-topbar__picker')!.getBoundingClientRect()
              .height,
          ),
        ).toBe(40);
        await frameUntil(
          () => host.querySelector('.map-topbar app-city-picker') !== null,
        );
        expect(
          host.querySelector('.map-topbar app-city-picker'),
        ).not.toBeNull();
        expect(host.querySelector('.city-placeholder')).toBeNull();

        fixture.debugElement
          .query(By.directive(CityPickerComponent))
          .componentInstance.citySelected.emit(SUPPORTED_CITIES[CityEnum.Graz]);
        expect(store.selectCity).toHaveBeenCalledWith(
          SUPPORTED_CITIES[CityEnum.Graz],
        );
      }, 10_000);
    });
  });

  it('shows one city picker in either layout', async () => {
    const host = create();
    await loadPicker();
    expect(host.querySelectorAll('app-city-picker').length).toBe(1);
    goNarrow();
    await loadPicker();
    expect(host.querySelectorAll('app-city-picker').length).toBe(1);
  });

  it('keeps the same map across the breakpoint, so a resize never rebuilds it', () => {
    create();
    const before = spotMap();
    goNarrow();
    expect(spotMap()).toBe(before);
  });

  it('builds no map while a shared link is still finding its city', () => {
    store.mapCity.set(null);
    const host = create();
    expect(host.querySelector('app-map-container')).toBeNull();
    expect(host.querySelector('.map-page__map')).not.toBeNull();
  });

  it('hands the store’s selection, hover and opening view to the map', () => {
    const focus: MapFocus = { center: [15.44, 47.07], zoom: 16 };
    store.selectedId.set('a');
    store.hoveredId.set('b');
    store.openOn.set(focus);
    create();
    expect(container().city()).toBe(CityEnum.Vienna);
    expect(spotMap().city()).toBe(CityEnum.Vienna);
    expect(spotMap().selectedId()).toBe('a');
    expect(spotMap().hoveredId()).toBe('b');
    expect(spotMap().openOn()).toEqual(focus);
  });

  it('hands the store’s list to the map', () => {
    const list = { type: 'FeatureCollection' as const, features: [ALPHA] };
    store.mapSpots.set(list);
    create();
    expect(spotMap().spots()).toBe(list);
  });

  it('feeds what the map reports into the store', () => {
    create();
    const bounds = { west: 16, south: 48, east: 17, north: 49 };
    spotMap().boundsChange.emit(bounds);
    spotMap().spotClick.emit('a');
    spotMap().pinHover.emit('b');

    expect(store.setBounds).toHaveBeenCalledWith(bounds);
    expect(store.open).toHaveBeenCalledWith('a', 'pin');
    expect(store.setHovered).toHaveBeenCalledWith('b');
  });

  it('tells both the frame and the store when the map gives up', () => {
    create();
    store.mapGaveUp.calls.reset();
    const onFailed = spyOn(container(), 'onFailed');
    spotMap().failed.emit('unreachable');
    expect(onFailed).toHaveBeenCalledOnceWith('unreachable');
    expect(store.mapGaveUp).toHaveBeenCalledTimes(1);
  });

  it('hands the map’s load events to the frame and the frame’s retry to the store', () => {
    create();
    const report = spyOn(container(), 'report');
    const onReady = spyOn(container(), 'onReady');
    spotMap().loadEvent.emit({ kind: 'painted' });
    spotMap().ready.emit();
    container().retry.emit();
    expect(report).toHaveBeenCalledOnceWith({ kind: 'painted' });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(store.reloadList).toHaveBeenCalledTimes(1);
  });

  it('binds the store’s load to the frame and its attempt to the map', () => {
    const events = [{ kind: 'spots-sent' }] as const;
    store.listEvents.set(events);
    store.listFailed.set(true);
    store.listAttempt.set(3);
    create();
    expect(container().spotEvents()).toBe(events);
    expect(container().listFailed()).toBeTrue();
    expect(spotMap().retryToken()).toBe(3);
  });

  it('feeds the list and the picker into the store', async () => {
    store.shownSpots.set([ALPHA, BETA]);
    store.notice.set('not-found');
    store.returnFocusTo.set('a');
    store.hoveredId.set('b');
    create();
    await loadPicker();
    const list = fixture.debugElement.query(By.directive(SpotListComponent))
      .componentInstance as SpotListComponent;
    expect(list.spots()).toEqual([ALPHA, BETA]);
    expect(list.notice()).toBe('not-found');
    expect(list.focusId()).toBe('a');
    expect(list.highlightedId()).toBe('b');

    list.open.emit('b');
    list.hover.emit('a');
    const picker = fixture.debugElement.query(By.directive(CityPickerComponent))
      .componentInstance as CityPickerComponent;
    picker.citySelected.emit(SUPPORTED_CITIES[CityEnum.Graz]);

    expect(store.open).toHaveBeenCalledWith('b', 'list');
    expect(store.setHovered).toHaveBeenCalledWith('a');
    expect(store.selectCity).toHaveBeenCalledWith(
      SUPPORTED_CITIES[CityEnum.Graz],
    );
  });

  it('shows the detail in the pane and passes its retry to the store', () => {
    const view: SpotDetailView = { status: 'failed', id: 'a', preview: ALPHA };
    store.selectedId.set('a');
    store.detail.set(view);
    create();
    const detail = fixture.debugElement.query(By.directive(SpotDetailComponent))
      .componentInstance as SpotDetailComponent;
    expect(detail.view()).toEqual(view);
    detail.retry.emit();
    expect(store.retryDetail).toHaveBeenCalledTimes(1);
  });

  it('announces the count politely, once it has held still', fakeAsync(() => {
    const host = create();
    const region = host.querySelector(
      // The page's own region, not the map container's loader announcement before it.
      '.map-page > [role="status"][aria-live="polite"]',
    )!;
    store.shownSpots.set([ALPHA]);
    fixture.detectChanges();
    store.shownSpots.set([ALPHA, BETA]);
    fixture.detectChanges();

    tick(COUNT_ANNOUNCE_DEBOUNCE_MS - 1);
    fixture.detectChanges();
    expect(region.textContent!.trim()).toBe('');

    tick(1);
    fixture.detectChanges();
    expect(region.textContent!.trim()).toBe('2 spots in view');
    discardPeriodicTasks();
  }));

  describe('announcing the not-found notice', () => {
    /** The page's polite live regions, whatever the layout puts them in. */
    const statusRegions = (host: HTMLElement) =>
      Array.from(host.querySelectorAll('[role="status"]'));

    for (const [layout, isWide] of [
      ['a wide screen', true],
      ['a phone', false],
    ] as const) {
      it(`reaches a screen reader on a cold dead link, on ${layout}`, () => {
        wide.next(isWide);
        store.selectedId.set('gone');
        store.detail.set({ status: 'loading', id: 'gone', preview: null });
        const host = create();
        // While the lookup runs the pane shows the detail, so there is no list yet.
        expect(host.querySelector('app-spot-list')).toBeNull();
        const regionsBefore = statusRegions(host);

        // The store sets the notice and clears the detail in one go; the list appears with it.
        store.notice.set('not-found');
        store.selectedId.set(null);
        store.detail.set(null);
        fixture.detectChanges();

        const announcing = statusRegions(host).filter((region) =>
          /not found/i.test(region.textContent ?? ''),
        );
        expect(announcing.length).toBe(1);
        expect(regionsBefore).toContain(announcing[0]);
        expect(announcing[0].getAttribute('aria-live')).toBe('polite');
        // The visible notice stays in the list, outside any live region.
        expect(
          host.querySelector('app-spot-list .spot-list__notice'),
        ).not.toBeNull();

        store.notice.set(null);
        fixture.detectChanges();
        expect((announcing[0].textContent ?? '').trim()).toBe('');
      });
    }
  });

  it('drops the not-found notice on the next pointer or key press anywhere on the page', () => {
    const host = create();
    host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );
    expect(store.dismissNotice).toHaveBeenCalledTimes(2);
  });
});
