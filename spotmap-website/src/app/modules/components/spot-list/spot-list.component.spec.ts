import { APP_BASE_HREF } from '@angular/common';
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

  it('lights the row whose pin is hovered, and only that one', () => {
    create(ROWS, { highlightedId: 'b' });
    expect(
      rows()
        .filter((link) => link.classList.contains('is-highlighted'))
        .map((link) => link.dataset['spotId']),
    ).toEqual(['b']);
    fixture.componentRef.setInput('highlightedId', null);
    fixture.detectChanges();
    expect(host().querySelector('.is-highlighted')).toBeNull();
  });

  it('reports the hovered row on a hover-capable pointer', () => {
    hoverPointer(true);
    create(ROWS);
    const hovered: (string | null)[] = [];
    fixture.componentInstance.hover.subscribe((id) => hovered.push(id));
    row('a').dispatchEvent(new MouseEvent('mouseenter'));
    row('a').dispatchEvent(new MouseEvent('mouseleave'));
    expect(hovered).toEqual(['a', null]);
  });

  it('reports no hover on a touch screen', () => {
    hoverPointer(false);
    create(ROWS);
    const hovered: (string | null)[] = [];
    fixture.componentInstance.hover.subscribe((id) => hovered.push(id));
    row('a').dispatchEvent(new MouseEvent('mouseenter'));
    row('a').dispatchEvent(new MouseEvent('mouseleave'));
    expect(hovered).toEqual([]);
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
