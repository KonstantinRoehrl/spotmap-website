import { APP_BASE_HREF, LocationStrategy } from '@angular/common';
import { NgZone, provideZoneChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { SpotListFeature, SpotStatus } from '../../../models/spots/spot';
import {
  SPOTMAP_BACKEND,
  SpotmapBackend,
  UNCONFIGURED_BACKEND,
} from '../../../services/spotmap-backend';
import { SpotListComponent } from './spot-list.component';

/** A backend with a photo host, so rows draw their cover thumbnails. */
const BACKEND: SpotmapBackend = {
  apiUrl: 'https://api.test',
  publishableKey: 'sb_publishable_test',
  photoBaseUrl: 'https://photos.test',
};

/** One list-shape spot; by default active with one photo, its cover `vienna/<id>-1.webp`. */
function spot(
  id: string,
  name: string,
  {
    cover = `vienna/${id}-1.webp`,
    photoCount = 1,
    status = 'active',
  }: { cover?: string | null; photoCount?: number; status?: SpotStatus } = {},
): SpotListFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [16.37, 48.2] },
    properties: { id, name, status, cover, photoCount },
  };
}

/** Three rows in the order the store hands them over: many photos, demolished, no photo. */
const ROWS: readonly SpotListFeature[] = [
  spot('a', 'Alpha Bank', { photoCount: 3 }),
  spot('b', 'Beta Ledge', { status: 'demolished' }),
  spot('c', 'Curb City', { cover: null, photoCount: 0 }),
];

/**
 * Answers the media queries the component and the pointer bloom ask: a hover-capable pointer
 * when `hover` is set, reduced motion never. Call before `create()`.
 */
function hoverPointer(hover: boolean): void {
  spyOn(window, 'matchMedia').and.callFake(
    (query: string) =>
      ({
        matches: hover && query.includes('hover: hover'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

/** What the browser paints for a design token, so colour assertions compare rendered output. */
function painted(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = token;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

/** Fires a bubbling mouse event at `target`, from or to `related`. */
function mouse(type: string, target: Element, related: Element | null = null) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, relatedTarget: related }),
  );
}

describe('SpotListComponent', () => {
  let fixture: ComponentFixture<SpotListComponent>;
  /** Whether the last click reaching the document had been taken by the row handler. */
  let lastClickPrevented: boolean | undefined;
  /**
   * Records whether the row handler took a click, then stops the browser following the link, so
   * a click the component lets through never navigates the Karma frame.
   */
  const guard = (event: Event) => {
    lastClickPrevented = event.defaultPrevented;
    event.preventDefault();
  };

  beforeEach(() => {
    lastClickPrevented = undefined;
    document.addEventListener('click', guard);
  });

  afterEach(() => {
    document.removeEventListener('click', guard);
    fixture?.destroy();
  });

  function create(
    spots: readonly SpotListFeature[] | null,
    {
      backend = BACKEND,
      ...inputs
    }: {
      backend?: SpotmapBackend;
      notice?: 'not-found' | null;
      highlightedId?: string | null;
      focusId?: string | null;
    } = {},
  ): ComponentFixture<SpotListComponent> {
    TestBed.configureTestingModule({
      // The notice's leave is a real transition the specs below measure; TestBed skips them by default.
      animationsEnabled: true,
      imports: [SpotListComponent],
      providers: [
        // The deploy's base href, so the hrefs prove the prefix is applied.
        { provide: APP_BASE_HREF, useValue: '/spotmap-website/' },
        { provide: SPOTMAP_BACKEND, useValue: backend },
      ],
    });
    fixture = TestBed.createComponent(SpotListComponent);
    fixture.componentRef.setInput('spots', spots);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    // Render hooks run on the app tick, not on a fixture's detectChanges.
    TestBed.tick();
    return fixture;
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const rows = () =>
    Array.from(host().querySelectorAll<HTMLAnchorElement>('a.spot-row'));
  const row = (id: string) =>
    host().querySelector<HTMLAnchorElement>(`a[data-spot-id="${id}"]`)!;
  const text = (element: Element | null) => (element?.textContent ?? '').trim();

  function click(target: HTMLElement, init: MouseEventInit = {}): void {
    target.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init,
      }),
    );
  }

  it('renders one row per spot, in the order given, as a list', () => {
    create(ROWS);
    expect(host().querySelector('ul')?.getAttribute('role')).toBe('list');
    expect(host().querySelectorAll('ul > li').length).toBe(3);
    expect(
      rows().map((link) => text(link.querySelector('.spot-row__name'))),
    ).toEqual(['Alpha Bank', 'Beta Ledge', 'Curb City']);
  });

  it('links every row to its spot under the base href', () => {
    create([...ROWS, spot('x y/z', 'Odd Id')]);
    expect(row('a').getAttribute('href')).toBe('/spotmap-website/spot/a');
    expect(row('x y/z').getAttribute('href')).toBe(
      '/spotmap-website/spot/x%20y%2Fz',
    );
  });

  it('opens a row in place on a plain primary click', () => {
    create(ROWS);
    const opened: string[] = [];
    fixture.componentInstance.open.subscribe((id) => opened.push(id));
    click(row('b'));
    expect(opened).toEqual(['b']);
    expect(lastClickPrevented).toBeTrue();
  });

  it('leaves a modified or non-primary click to the browser', () => {
    create(ROWS);
    const opened: string[] = [];
    fixture.componentInstance.open.subscribe((id) => opened.push(id));
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      click(row('a'), init);
      expect(lastClickPrevented).withContext(JSON.stringify(init)).toBeFalse();
    }
    expect(opened).toEqual([]);
  });

  it('shows the cover thumbnail, lazily and as decoration', () => {
    create(ROWS);
    const thumb = row('a').querySelector('img')!;
    expect(thumb.getAttribute('src')).toBe(
      'https://photos.test/thumb/vienna/a-1.webp',
    );
    expect(thumb.getAttribute('alt')).toBe('');
    expect(thumb.getAttribute('loading')).toBe('lazy');
  });

  it('shows a NO PHOTO box for a spot without a cover', () => {
    create(ROWS);
    expect(row('c').querySelector('img')).toBeNull();
    const placeholder = row('c').querySelector('.spot-row__thumb--empty')!;
    expect(text(placeholder)).toBe('NO PHOTO');
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the NO PHOTO box on every row when no photo host is configured', () => {
    create(ROWS, { backend: UNCONFIGURED_BACKEND });
    expect(host().querySelectorAll('img').length).toBe(0);
    expect(host().querySelectorAll('.spot-row__thumb--empty').length).toBe(3);
  });

  it('gives the thumbnail and its placeholder the same 4:3 box', () => {
    create(ROWS);
    for (const id of ['a', 'c']) {
      const box = row(id).querySelector<HTMLElement>('.spot-row__thumb')!;
      expect([box.offsetWidth, box.offsetHeight])
        .withContext(id)
        .toEqual([72, 54]);
    }
  });

  it('counts the photos and marks a demolished spot', () => {
    create(ROWS);
    expect(
      rows().map((link) => text(link.querySelector('.spot-row__meta'))),
    ).toEqual(['3 PHOTOS', 'DEMOLISHED · 1 PHOTO', 'NO PHOTOS']);
  });

  it('sets the name in uppercase bright ink, unlit at rest', () => {
    create(ROWS);
    const name = getComputedStyle(row('a').querySelector('.spot-row__name')!);
    expect(name.textTransform).toBe('uppercase');
    expect(name.color).toBe(painted('var(--color-phosphor-bright)'));
    expect(name.textShadow).toBe('none');
  });

  it('gives every row the inset pointer bloom and a thumb-sized target', () => {
    create(ROWS);
    for (const link of rows()) {
      expect(link.classList).toContain('phosphor-bloom');
      expect(link.classList).toContain('phosphor-bloom--inset');
      expect(link.offsetHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('says it is loading while the city’s spots are on their way', () => {
    create(null);
    expect(text(host())).toBe('> LOADING SPOTS…');
    expect(host().querySelector('ul')).toBeNull();
  });

  it('says so, in the house voice, when no spot is in view', () => {
    create([]);
    const lines = Array.from(host().querySelectorAll('p')).map(text);
    expect(lines).toEqual([
      '> NO SPOTS IN VIEW',
      'pan around or zoom out. the city’s bigger than this.',
    ]);
  });

  it('shows a gone link’s notice above the rows', () => {
    create(ROWS, { notice: 'not-found' });
    const notice = host().querySelector('.spot-list__notice')!;
    expect(text(notice)).toBe('> FILE NOT FOUND // GONE FROM THE ARCHIVE');
    expect(
      notice.compareDocumentPosition(host().querySelector('ul')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('leaves announcing a gone link’s notice to the page, which has a live region in place before it', () => {
    create(ROWS);
    fixture.componentRef.setInput('notice', 'not-found');
    fixture.detectChanges();
    // The list can be created with the notice already in it, which no screen reader announces.
    expect(host().querySelector('.spot-list__notice')).not.toBeNull();
    expect(host().querySelector('[role="status"], [aria-live]')).toBeNull();
  });

  /** Resolves once every transition and animation running inside the list has finished. */
  async function settled(): Promise<void> {
    await Promise.all(
      host()
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  }

  /** Waits, in real time, for `done` to hold; a leave animation removes its element when it ends. */
  async function until(done: () => boolean): Promise<void> {
    for (let waited = 0; !done() && waited < 2000; waited += 20) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it('eases the rows down as the notice arrives instead of pushing them at once', async () => {
    create(ROWS);
    const list = host().querySelector('ul')!;
    const resting = list.getBoundingClientRect().top;

    fixture.componentRef.setInput('notice', 'not-found');
    fixture.detectChanges();
    const justInserted = list.getBoundingClientRect().top;
    await settled();
    const settledTop = list.getBoundingClientRect().top;

    expect(settledTop).toBeGreaterThan(resting);
    expect(justInserted).toBeLessThan(settledTop);
  });

  it('eases the rows back up as the notice goes, so nothing jumps when it is removed', async () => {
    create(ROWS, { notice: 'not-found' });
    await settled();
    const list = host().querySelector('ul')!;
    const withNotice = list.getBoundingClientRect().top;
    const slot = host().querySelector<HTMLElement>('.spot-list__notice-slot')!;

    fixture.componentRef.setInput('notice', null);
    fixture.detectChanges();

    // The notice stays while its height eases away: the rows have not moved yet, and the slot's
    // own row track is the thing running, so they move with it rather than at its end.
    expect(slot.isConnected).toBeTrue();
    expect(list.getBoundingClientRect().top).toBe(withNotice);
    const running = slot
      .getAnimations()
      .map((animation) => (animation as CSSTransition).transitionProperty);
    expect(running).toContain('grid-template-rows');
    expect(running).toContain('opacity');

    await until(() => host().querySelector('.spot-list__notice') === null);
    expect(list.getBoundingClientRect().top).toBeLessThan(withNotice);
  });

  for (const [label, spots] of [
    ['loading', null],
    ['empty', []],
  ] as const) {
    it(`fades the ${label} lines in and out instead of cutting them`, () => {
      create(spots);
      const lines = Array.from(
        host().querySelectorAll<HTMLElement>('.spot-list__line'),
      );
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const style = getComputedStyle(line);
        expect(style.transitionProperty).toContain('opacity');
        // Just inserted: still at the start of its fade-in.
        expect(parseFloat(style.opacity)).toBeLessThan(0.5);
        line.classList.add('spot-list__line--leaving');
        const leaving = getComputedStyle(line);
        expect(leaving.opacity).toBe('0');
        // Out of the flow, so the rows arriving in its place do not wait below it.
        expect(leaving.position).toBe('absolute');
      }
    });
  }

  it('lights the row whose pin is hovered, and only that one', () => {
    create(ROWS, { highlightedId: 'b' });
    expect(
      rows()
        .filter((link) => link.classList.contains('is-highlighted'))
        .map((link) => link.dataset['spotId']),
    ).toEqual(['b']);
    fixture.componentRef.setInput('highlightedId', null);
    fixture.detectChanges();
    TestBed.tick();
    expect(host().querySelector('.is-highlighted')).toBeNull();
  });

  it('changes one row’s class on a hover and derives no row again', () => {
    create(ROWS, { highlightedId: 'a' });
    const derive = spyOn(
      TestBed.inject(LocationStrategy),
      'prepareExternalUrl',
    ).and.callThrough();
    const changes = new MutationObserver(() => undefined);
    changes.observe(host(), {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });

    fixture.componentRef.setInput('highlightedId', 'b');
    fixture.detectChanges();
    TestBed.tick();

    expect(
      changes
        .takeRecords()
        .map((record) => (record.target as HTMLElement).dataset['spotId']),
    ).toEqual(['a', 'b']);
    expect(derive).not.toHaveBeenCalled();
    changes.disconnect();
  });

  it('derives each row once per list change', () => {
    const strategy = jasmine.createSpyObj<LocationStrategy>(
      'LocationStrategy',
      ['prepareExternalUrl'],
    );
    strategy.prepareExternalUrl.and.callFake((path: string) => path);
    TestBed.configureTestingModule({
      providers: [{ provide: LocationStrategy, useValue: strategy }],
    });
    create(ROWS);
    expect(strategy.prepareExternalUrl).toHaveBeenCalledTimes(ROWS.length);
    fixture.componentRef.setInput('notice', 'not-found');
    fixture.detectChanges();
    expect(strategy.prepareExternalUrl).toHaveBeenCalledTimes(ROWS.length);
  });

  it('lights a row that arrives after its pin was hovered', () => {
    create(null, { highlightedId: 'b' });
    fixture.componentRef.setInput('spots', ROWS);
    fixture.detectChanges();
    TestBed.tick();
    expect(row('b').classList).toContain('is-highlighted');
  });

  it('does not light a row on its way out', () => {
    create(ROWS);
    row('b').parentElement!.classList.add('spot-list__item--leaving');
    fixture.componentRef.setInput('highlightedId', 'b');
    fixture.detectChanges();
    TestBed.tick();
    expect(row('b').classList).not.toContain('is-highlighted');
  });

  it('hangs its listeners on the list and none on a row', () => {
    hoverPointer(true);
    const listening = spyOn(
      EventTarget.prototype,
      'addEventListener',
    ).and.callThrough();
    create(ROWS);
    const list = host().querySelector('ul')!;
    const calls = listening.calls.all();
    expect(
      calls
        .filter((call) => call.object === list)
        .map((call) => call.args[0])
        .sort(),
    ).toEqual([
      'click',
      'mouseout',
      'mouseover',
      'pointerdown',
      'pointermove',
      'pointerout',
      'touchstart',
    ]);
    expect(
      calls.filter(
        (call) =>
          call.object instanceof Element &&
          call.object.closest('ul') !== null &&
          call.object !== list,
      ),
    ).toEqual([]);
  });

  it('does nothing for a click off any row', () => {
    create(ROWS);
    const opened: string[] = [];
    fixture.componentInstance.open.subscribe((id) => opened.push(id));
    click(host().querySelector('ul')!);
    expect(opened).toEqual([]);
    expect(lastClickPrevented).toBeFalse();
  });

  it('opens a row from a click on something inside it', () => {
    create(ROWS);
    const opened: string[] = [];
    fixture.componentInstance.open.subscribe((id) => opened.push(id));
    click(row('a').querySelector<HTMLElement>('.spot-row__name')!);
    expect(opened).toEqual(['a']);
  });

  it('reports the hovered row on a hover-capable pointer, as enter and leave would', () => {
    hoverPointer(true);
    create(ROWS);
    const hovered: (string | null)[] = [];
    fixture.componentInstance.hover.subscribe((id) => hovered.push(id));
    const name = row('a').querySelector('.spot-row__name')!;

    mouse('mouseover', row('a'));
    // Moving inside a row crosses its children: no enter, no leave.
    mouse('mouseout', row('a'), name);
    mouse('mouseover', name, row('a'));
    expect(hovered).toEqual(['a']);

    // To the adjacent row: null, then its id.
    mouse('mouseout', name, row('b'));
    mouse('mouseover', row('b'), name);
    expect(hovered).toEqual(['a', null, 'b']);

    // Onto the gap between rows, and on out of the list: one null.
    mouse('mouseout', row('b'), host().querySelector('ul'));
    mouse('mouseover', host().querySelector('ul')!, row('b'));
    expect(hovered).toEqual(['a', null, 'b', null]);
  });

  it('reports a stationary pointer again when the list comes back under it', () => {
    hoverPointer(true);
    create(ROWS);
    const hovered: (string | null)[] = [];
    fixture.componentInstance.hover.subscribe((id) => hovered.push(id));
    mouse('mouseover', row('a'));
    fixture.componentRef.setInput('spots', null);
    fixture.detectChanges();
    TestBed.tick();
    fixture.componentRef.setInput('spots', ROWS);
    fixture.detectChanges();
    TestBed.tick();
    // The outgoing list may still be fading out ahead of the new one: take the last match.
    const fresh = Array.from(
      host().querySelectorAll('a[data-spot-id="a"]'),
    ).pop()!;
    mouse('mouseover', fresh);
    expect(hovered).toEqual(['a', 'a']);
  });

  it('reports no hover on a touch screen', () => {
    hoverPointer(false);
    create(ROWS);
    const hovered: (string | null)[] = [];
    fixture.componentInstance.hover.subscribe((id) => hovered.push(id));
    mouse('mouseover', row('a'));
    mouse('mouseout', row('a'));
    expect(hovered).toEqual([]);
  });

  it('removes its hover listeners when the list goes to its loading line', () => {
    hoverPointer(true);
    create(ROWS);
    const list = host().querySelector('ul')!;
    const removed = spyOn(list, 'removeEventListener').and.callThrough();
    fixture.componentRef.setInput('spots', null);
    fixture.detectChanges();
    TestBed.tick();
    expect(removed.calls.allArgs().map(([type]) => type)).toEqual(
      jasmine.arrayContaining(['mouseover', 'mouseout']),
    );
  });

  it('focuses the row a closed detail was opened from, once', async () => {
    create(ROWS);
    fixture.componentRef.setInput('focusId', 'b');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(row('b'));

    // A later render with the same value leaves focus wherever the visitor moved it.
    row('a').focus();
    fixture.componentRef.setInput('spots', [...ROWS]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(row('a'));
  });

  it('waits for the row to be on screen before focusing it', async () => {
    create(null, { focusId: 'b' });
    await fixture.whenStable();
    fixture.componentRef.setInput('spots', ROWS);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(row('b'));
  });

  it('fades rows in and out instead of cutting them', () => {
    create(ROWS);
    const item = host().querySelector<HTMLElement>('ul > li')!;
    expect(getComputedStyle(item).transitionProperty).toContain('opacity');
    item.classList.add('spot-list__item--leaving');
    expect(getComputedStyle(item).opacity).toBe('0');
  });

  it('skips off-screen rows and reserves the height a row actually renders at', () => {
    create(ROWS);
    const item = host().querySelector<HTMLElement>('ul > li')!;
    const style = getComputedStyle(item);
    expect(style.contentVisibility).toBe('auto');
    expect(style.containIntrinsicBlockSize).toBe(
      `auto ${item.getBoundingClientRect().height}px`,
    );
  });

  it('sets no text below 12 px', () => {
    create(ROWS, { notice: 'not-found' });
    for (const element of Array.from(host().querySelectorAll('*'))) {
      if (text(element) === '') {
        continue;
      }
      expect(parseFloat(getComputedStyle(element).fontSize))
        .withContext(element.className)
        .toBeGreaterThanOrEqual(12);
    }
  });
});

describe('SpotListComponent in the Angular zone', () => {
  it('watches hover outside the zone and emits inside it', async () => {
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: query.includes('hover: hover'),
          media: query,
        }) as MediaQueryList,
    );
    TestBed.configureTestingModule({
      imports: [SpotListComponent],
      providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        { provide: SPOTMAP_BACKEND, useValue: BACKEND },
      ],
    });
    const f = TestBed.createComponent(SpotListComponent);
    f.componentRef.setInput('spots', ROWS);
    f.detectChanges();
    TestBed.tick();
    const list = f.nativeElement.querySelector('ul') as HTMLElement;
    const inZone: boolean[] = [];
    f.componentInstance.hover.subscribe(() =>
      inZone.push(NgZone.isInAngularZone()),
    );
    let zoneTurns = 0;
    const subscription = TestBed.inject(NgZone).onMicrotaskEmpty.subscribe(
      () => zoneTurns++,
    );

    list.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    // Event coalescing delays an in-zone turn until a frame or timeout, so wait past it.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(zoneTurns).toBe(0);

    list
      .querySelector('a[data-spot-id="a"]')!
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(inZone).toEqual([true]);

    subscription.unsubscribe();
    f.destroy();
  });
});
