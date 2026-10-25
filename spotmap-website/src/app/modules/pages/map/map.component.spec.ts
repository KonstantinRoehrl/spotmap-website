import { BreakpointObserver } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, output, signal } from '@angular/core';
import {
  ComponentFixture,
  discardPeriodicTasks,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, map } from 'rxjs';

import { CityEnum } from '../../../models/enums/map-enum';
import { MapFocus, NO_INSETS } from '../../../models/map/map-camera';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import type { SpotListFeature } from '../../../models/spots/spot';
import type { SpotDetailView } from '../../../models/spots/spot-detail-view';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { CityPickerComponent } from '../../components/city-picker/city-picker.component';
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
  WIDE_LAYOUT_QUERY,
} from './map.component';
import { HEADER_BANNER_FONT_PX } from './topbar-banner';
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
  readonly lineStart = output<string>();
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

/** A store the specs drive by hand: every state a writable signal, every action a spy. */
function fakeStore() {
  return {
    city: signal(SUPPORTED_CITIES[CityEnum.Vienna]),
    mapCity: signal<CityEnum | null>(CityEnum.Vienna),
    openOn: signal<MapFocus | null>(null),
    selectedId: signal<string | null>(null),
    shownSpots: signal<readonly SpotListFeature[] | null>(null),
    detail: signal<SpotDetailView | null>(null),
    notice: signal<'not-found' | null>(null),
    hoveredId: signal<string | null>(null),
    returnFocusTo: signal<string | null>(null),
    selectCity: jasmine.createSpy('selectCity'),
    setList: jasmine.createSpy('setList'),
    setBounds: jasmine.createSpy('setBounds'),
    open: jasmine.createSpy('open'),
    close: jasmine.createSpy('close'),
    retryDetail: jasmine.createSpy('retryDetail'),
    setHovered: jasmine.createSpy('setHovered'),
    dismissNotice: jasmine.createSpy('dismissNotice'),
  };
}

describe('MapComponent', () => {
  let fixture: ComponentFixture<MapComponent>;
  let store: ReturnType<typeof fakeStore>;
  /** Whether the viewport is at least 1024 px wide, as the breakpoint stub reports it. */
  let wide: BehaviorSubject<boolean>;
  /** Whether the viewport is a phone's width, as the breakpoint stub reports it for any other query. */
  let compact: BehaviorSubject<boolean>;

  beforeEach(async () => {
    store = fakeStore();
    wide = new BehaviorSubject(true);
    compact = new BehaviorSubject(false);
    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAP_FACTORY, useValue: neverResolves },
        { provide: ELEVATION_LOADER, useValue: neverResolves },
        {
          provide: BreakpointObserver,
          useValue: {
            isMatched: (query: string) =>
              (query === WIDE_LAYOUT_QUERY ? wide : compact).value,
            observe: (query: string) =>
              (query === WIDE_LAYOUT_QUERY ? wide : compact).pipe(
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
    TestBed.overrideComponent(MapComponent, {
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

    it('puts the banner and the city picker in a header row above the window', () => {
      const host = create();

      const header = host.querySelector<HTMLElement>('header.map-header');
      expect(header).not.toBeNull();
      expect(header?.querySelector('app-city-picker')).not.toBeNull();
      expect(
        host.querySelector('aside.spot-column app-city-picker'),
      ).toBeNull();
      expect(host.querySelector('.map-topbar')).toBeNull();

      const banner = fixture.debugElement.query(By.css('.map-header__banner'));
      expect(banner).not.toBeNull();
      const stub = banner?.componentInstance as StubBannerComponent;
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

    it('sets the header row’s city select 40 px tall', () => {
      const host = create();
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
      expect(container().coveredInsets()).toEqual(NO_INSETS);
      expect(container().attributionCorner()).toBe('bottom-right');
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
      fixture.detectChanges();

      expect(columnWidth(host)).toBe(500);
      expect(handle().columnWidth()).toBe(500);
      expect(
        Number(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)),
      ).toBeCloseTo(500 / frameWidth(host), 6);
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
      expect(style.borderBottomWidth).toBe('1px');
      // The toolbar never scrolls: it sits beside the pane, not inside it.
      expect(toolbar!.closest('.spot-pane')).toBeNull();
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

    it('turns the count into a 32 px back plate with a 44 px target while a spot is open', () => {
      store.shownSpots.set([ALPHA, BETA]);
      showSpot('a', ALPHA);
      const host = create();

      const back = host.querySelector<HTMLButtonElement>(
        '.spot-column__toolbar button',
      )!;
      expect(back.textContent!.trim()).toBe('‹ 2 IN VIEW');
      // The visible words (the count) lead the name, then what a tap does.
      expect(back.getAttribute('aria-label')).toBe(
        '2 in view, back to the list',
      );
      expect(back.classList).toContain('phosphor-bloom--plate');
      expect(back.getBoundingClientRect().height).toBe(32);
      const hit = getComputedStyle(back, '::after');
      expect([hit.position, hit.top, hit.bottom]).toEqual([
        'absolute',
        '-6px',
        '-6px',
      ]);

      back.click();
      expect(store.close).toHaveBeenCalledTimes(1);
      expect(host.querySelector('app-spot-detail')).not.toBeNull();
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
        ['.spot-column__back', true],
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

    it('words the back button without a number while the count is unknown', () => {
      showSpot('a', ALPHA);
      const host = create();

      const back = host.querySelector<HTMLButtonElement>('.spot-column__back')!;
      expect(back.textContent!.trim()).toBe('‹ IN VIEW');
    });
  });

  describe('on a phone', () => {
    beforeEach(() => wide.next(false));

    it('puts a slim top bar over the map and the sheet under it', () => {
      const host = create();
      expect(host.querySelector('.map-topbar app-city-picker')).not.toBeNull();
      expect(host.querySelector('app-spot-sheet app-spot-list')).not.toBeNull();
      expect(host.querySelector('aside.spot-column')).toBeNull();
    });

    it('tells the map the sheet covers its bottom, and keeps the credits top right', () => {
      const host = create();
      expect(container().coveredInsets()).toEqual({
        ...NO_INSETS,
        bottom: sheetHeight('peek', frameHeight(host)),
      });
      expect(container().attributionCorner()).toBe('top-right');
    });

    it('opens the list from the sheet head and covers more of the map', () => {
      const host = create();
      sheet().headTap.emit();
      fixture.detectChanges();

      expect(sheet().state()).toBe('list');
      expect(container().coveredInsets().bottom).toBe(
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

      container().emptyClick.emit();
      fixture.detectChanges();
      expect(store.close).toHaveBeenCalledTimes(1);
      expect(sheet().state()).toBe('peek');
    });

    it('ignores a tap on empty map while no spot is open', () => {
      create();
      container().emptyClick.emit();
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
      /** The phone widths the bar has to work at, from the narrowest to a large phone. */
      const PHONE_WIDTHS = [320, 360, 390];
      /** One glyph of the banner's 12 px IBM Plex Mono, the smallest size the banner may be set in. */
      const BANNER_GLYPH_PX = 12 * 0.6;

      it('makes the city select a 44 px target without growing past the 46 px bar', () => {
        compact.next(true);
        const host = create(360);

        const field = host.querySelector<HTMLElement>(
          '.map-topbar .mat-mdc-text-field-wrapper',
        )!;
        expect(field.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(
          host.querySelector('.map-topbar')!.getBoundingClientRect().height,
        ).toBeLessThanOrEqual(46);
      });

      for (const width of PHONE_WIDTHS) {
        it(`sets every line of the banner so it fits its room at ${width} px`, () => {
          compact.next(true);
          const host = create(width);

          const banner = host.querySelector<HTMLElement>(
            '.map-topbar__banner',
          )!;
          const lines = fixture.debugElement
            .query(By.directive(StubBannerComponent))
            .componentInstance.messages() as string[];
          const longest = Math.max(...lines.map((line) => line.length));
          expect(longest * BANNER_GLYPH_PX).toBeLessThanOrEqual(
            banner.clientWidth,
          );
        });
      }

      it('shows every city’s label in full at 320 px, with no ellipsis on the chosen city', async () => {
        compact.next(true);
        const host = create(320);
        const bar = host.querySelector<HTMLElement>('.map-topbar')!;
        const picker = host.querySelector<HTMLElement>('.map-topbar__picker')!;
        const value = host.querySelector<HTMLElement>(
          '.map-topbar .mat-mdc-select-value',
        )!;

        for (const entry of Object.values(SUPPORTED_CITIES)) {
          store.city.set(entry);
          fixture.detectChanges();
          await fixture.whenStable();
          fixture.detectChanges();
          expect(value.scrollWidth)
            .withContext(`${entry.city} · ${entry.countryCode}`)
            .toBeLessThanOrEqual(value.clientWidth);
        }
        expect(
          parseFloat(getComputedStyle(value).fontSize),
        ).toBeGreaterThanOrEqual(12);
        expect(picker.getBoundingClientRect().right).toBeLessThanOrEqual(
          bar.getBoundingClientRect().right,
        );
      });

      it('fits the banner for the longest city name too', () => {
        compact.next(true);
        const host = create(320);
        const banner = host.querySelector<HTMLElement>('.map-topbar__banner')!;
        const stub = fixture.debugElement.query(
          By.directive(StubBannerComponent),
        ).componentInstance as StubBannerComponent;

        for (const entry of Object.values(SUPPORTED_CITIES)) {
          store.city.set(entry);
          fixture.detectChanges();
          const cityLine = stub.messages()[0];
          expect(cityLine.length * BANNER_GLYPH_PX).toBeLessThanOrEqual(
            banner.clientWidth,
          );
        }
      });

      it('keeps the full set of lines on a wider narrow screen, where they fit', () => {
        compact.next(false);
        const host = create(600);

        const stub = fixture.debugElement.query(
          By.directive(StubBannerComponent),
        ).componentInstance as StubBannerComponent;
        const banner = host.querySelector<HTMLElement>('.map-topbar__banner')!;
        expect(stub.messages()).toContain('SUPPORTED BY ROLLTROTTEL-VERBAND');
        expect(
          Math.max(...stub.messages().map((line) => line.length)) *
            BANNER_GLYPH_PX,
        ).toBeLessThanOrEqual(banner.clientWidth);
      });
    });
  });

  describe('keyboard focus when a spot closes', () => {
    it('lands on the count line on a wide screen when no row opened the spot', () => {
      store.shownSpots.set([ALPHA, BETA]);
      showSpot('a', ALPHA);
      const host = create();
      host.querySelector<HTMLButtonElement>('.spot-column__back')!.focus();

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
      host.querySelector<HTMLButtonElement>('.spot-column__back')!.focus();

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
      host.querySelector<HTMLButtonElement>('.spot-sheet__back')!.focus();

      sheet().back.emit();
      closeSpot();

      expect(document.activeElement).toBe(
        host.querySelector('.spot-sheet__toggle'),
      );
    });

    it('leaves focus where the visitor put it when it was not in the spot', () => {
      store.shownSpots.set([ALPHA, BETA]);
      showSpot('a', ALPHA);
      const host = create();
      const picker = host.querySelector<HTMLElement>('.map-header mat-select')!;
      picker.focus();
      expect(document.activeElement).toBe(picker);

      closeSpot();

      expect(document.activeElement).toBe(picker);
    });
  });

  it('shows one city picker in either layout', () => {
    const host = create();
    expect(host.querySelectorAll('app-city-picker').length).toBe(1);
    goNarrow();
    expect(host.querySelectorAll('app-city-picker').length).toBe(1);
  });

  it('keeps the same map across the breakpoint, so a resize never rebuilds it', () => {
    create();
    const before = container();
    goNarrow();
    expect(container()).toBe(before);
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
    expect(container().selectedId()).toBe('a');
    expect(container().hoveredId()).toBe('b');
    expect(container().openOn()).toEqual(focus);
  });

  it('feeds what the map reports into the store', () => {
    create();
    const collection = {
      type: 'FeatureCollection' as const,
      features: [ALPHA],
    };
    const bounds = { west: 16, south: 48, east: 17, north: 49 };
    container().spotsLoaded.emit(collection);
    container().boundsChange.emit(bounds);
    container().spotClick.emit('a');
    container().pinHover.emit('b');

    expect(store.setList).toHaveBeenCalledWith(collection);
    expect(store.setBounds).toHaveBeenCalledWith(bounds);
    expect(store.open).toHaveBeenCalledWith('a', 'pin');
    expect(store.setHovered).toHaveBeenCalledWith('b');
  });

  it('feeds the list and the picker into the store', () => {
    store.shownSpots.set([ALPHA, BETA]);
    store.notice.set('not-found');
    store.returnFocusTo.set('a');
    store.hoveredId.set('b');
    create();
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
