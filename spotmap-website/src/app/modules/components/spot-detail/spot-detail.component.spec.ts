import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';

import type {
  SpotDetail,
  SpotListFeature,
  SpotListProperties,
} from '../../../models/spots/spot';
import type { SpotDetailView } from '../../../models/spots/spot-detail-view';
import {
  SPOTMAP_BACKEND,
  SpotmapBackend,
  UNCONFIGURED_BACKEND,
} from '../../../services/spotmap-backend';
import { directionsUrl } from './directions';
import { SHARE_NAVIGATOR, ShareNavigator } from './share-spot';
import { SHARE_STATUS_MS, SpotDetailComponent } from './spot-detail.component';

/** A backend with a photo host, so the gallery, strip and covers render. */
const BACKEND: SpotmapBackend = {
  apiUrl: 'https://api.test',
  publishableKey: 'sb_publishable_test',
  photoBaseUrl: 'https://photos.test',
};

/** A loaded spot with three photos and two lines of notes. */
function detail(overrides: Partial<SpotDetail> = {}): SpotDetail {
  return {
    id: 'a-1',
    city: 'vienna',
    name: 'Alpha Bank',
    status: 'active',
    notes: 'Wax it.\nBring a broom.',
    photos: ['vienna/a-1-1.webp', 'vienna/a-1-2.webp', 'vienna/a-1-3.webp'],
    coordinates: [16.3785491, 48.1840844],
    ...overrides,
  };
}

/** What the list knew about the spot when it was opened. */
function preview(overrides: Partial<SpotListProperties> = {}): SpotListFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [16.3785491, 48.1840844] },
    properties: {
      id: 'a-1',
      name: 'Alpha Bank',
      status: 'active',
      cover: 'vienna/a-1-1.webp',
      photoCount: 3,
      ...overrides,
    },
  };
}

const loaded = (spot: SpotDetail = detail()): SpotDetailView => ({
  status: 'loaded',
  id: spot.id,
  spot,
});
const loading = (
  from: SpotListFeature | null = preview(),
  id = 'a-1',
): SpotDetailView => ({ status: 'loading', id, preview: from });
const failed = (
  from: SpotListFeature | null = preview(),
  id = 'a-1',
): SpotDetailView => ({ status: 'failed', id, preview: from });

/** A navigator with no share sheet whose clipboard answers with `copy`. */
function copyingNavigator(copy: jasmine.Spy): ShareNavigator {
  return { clipboard: { writeText: copy } } as unknown as ShareNavigator;
}

/** What the browser paints for a colour token, to compare against computed styles. */
function painted(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = token;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

describe('SpotDetailComponent', () => {
  let fixture: ComponentFixture<SpotDetailComponent>;
  let writeText: jasmine.Spy;

  beforeEach(() => {
    writeText = jasmine.createSpy('writeText').and.resolveTo();
  });

  afterEach(() => fixture?.destroy());

  function create(
    view: SpotDetailView,
    {
      backend = BACKEND,
      nav = copyingNavigator(writeText),
    }: { backend?: SpotmapBackend; nav?: ShareNavigator } = {},
  ): ComponentFixture<SpotDetailComponent> {
    TestBed.configureTestingModule({
      imports: [SpotDetailComponent],
      providers: [
        { provide: SPOTMAP_BACKEND, useValue: backend },
        { provide: SHARE_NAVIGATOR, useValue: nav },
      ],
    });
    fixture = TestBed.createComponent(SpotDetailComponent);
    // A definite width, as the list column and the sheet give it.
    (fixture.nativeElement as HTMLElement).style.cssText =
      'display:block;width:320px';
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
    return fixture;
  }

  function show(view: SpotDetailView): void {
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const find = <T extends Element = HTMLElement>(selector: string) =>
    host().querySelector<T>(selector);
  const text = (element: Element | null) => (element?.textContent ?? '').trim();
  const stripButtons = () =>
    Array.from(
      host().querySelectorAll<HTMLButtonElement>('.spot-detail__strip-photo'),
    );
  /** The share status the visitor reads: lines on their way out are not counted. */
  const shareStatus = () =>
    Array.from(
      host().querySelectorAll(
        '.spot-detail__share-line:not(.spot-detail__share-line--leaving)',
      ),
    )
      .map(text)
      .join('');
  const shareButton = () =>
    Array.from(host().querySelectorAll('button')).find(
      (button) => text(button) === '> SHARE SPOT',
    )!;

  /** Asserts the selectors match elements that follow each other in document order. */
  function expectInOrder(selectors: string[]): void {
    const elements = selectors.map((selector) => find(selector));
    elements.forEach((element, index) =>
      expect(element).withContext(selectors[index]).not.toBeNull(),
    );
    for (let index = 1; index < elements.length; index += 1) {
      expect(
        elements[index - 1]!.compareDocumentPosition(elements[index]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      )
        .withContext(`${selectors[index - 1]} before ${selectors[index]}`)
        .toBeTruthy();
    }
  }

  it('lays a spot out as gallery, strip, rights, name, notes, then actions', () => {
    create(loaded());
    expectInOrder([
      'app-spot-photo-gallery',
      '.spot-detail__strip',
      '.spot-detail__rights',
      '.spot-detail__name',
      '.spot-detail__notes',
      '.spot-detail__actions',
    ]);
  });

  it('puts the demolished line between the notes and the actions', () => {
    create(loaded(detail({ status: 'demolished' })));
    expectInOrder([
      '.spot-detail__notes',
      '.spot-detail__status',
      '.spot-detail__actions',
    ]);
    expect(text(find('.spot-detail__status'))).toBe('> DEMOLISHED');
    expect(getComputedStyle(find('.spot-detail__status')!).textShadow).toBe(
      'none',
    );
  });

  it('labels the region with the spot’s name', () => {
    create(loaded());
    const region = find('section')!;
    expect(region.getAttribute('role')).toBe('region');
    const heading = find('h2')!;
    expect(region.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(text(heading)).toBe('Alpha Bank');
  });

  it('builds the gallery from the photos’ thumbnails', () => {
    create(loaded());
    expect(find<HTMLImageElement>('.gallery__photo')!.getAttribute('src')).toBe(
      'https://photos.test/thumb/vienna/a-1-1.webp',
    );
  });

  it('shows the gallery and the rights line but no strip for a single photo', () => {
    create(loaded(detail({ photos: ['vienna/a-1-1.webp'] })));
    expect(find('app-spot-photo-gallery')).not.toBeNull();
    expect(find('.spot-detail__rights')).not.toBeNull();
    expect(find('.spot-detail__strip')).toBeNull();
  });

  it('starts at the name for a spot without photos', () => {
    create(loaded(detail({ photos: [] })));
    expect(find('app-spot-photo-gallery')).toBeNull();
    expect(find('.spot-detail__strip')).toBeNull();
    expect(find('.spot-detail__rights')).toBeNull();
  });

  it('starts at the name when no photo host is configured', () => {
    create(loaded(), { backend: UNCONFIGURED_BACKEND });
    expect(find('app-spot-photo-gallery')).toBeNull();
    expect(find('.spot-detail__strip')).toBeNull();
    expect(find('.spot-detail__rights')).toBeNull();
    expect(find('.spot-detail__name')).not.toBeNull();
  });

  it('labels every strip photo and marks the current one', () => {
    create(loaded());
    expect(stripButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Photo 1 of 3',
      'Photo 2 of 3',
      'Photo 3 of 3',
    ]);
    expect(stripButtons().map((b) => b.getAttribute('aria-current'))).toEqual([
      'true',
      null,
      null,
    ]);
  });

  it('jumps the gallery to a strip photo when it is tapped', async () => {
    create(loaded());
    stripButtons()[2].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(text(find('.gallery__counter'))).toBe('[3/3]');
    expect(stripButtons()[2].classList).toContain('is-current');
  });

  it('moves the strip’s frame along with the gallery’s arrows', async () => {
    create(loaded());
    find<HTMLButtonElement>('.gallery__nav--next')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(stripButtons()[1].classList).toContain('is-current');
    expect(stripButtons()[0].classList).not.toContain('is-current');
  });

  it('keeps the notes verbatim, line breaks and case included, and unlit', () => {
    create(loaded());
    const notes = find('.spot-detail__notes')!;
    expect(notes.textContent).toBe('Wax it.\nBring a broom.');
    const style = getComputedStyle(notes);
    expect(style.whiteSpace).toBe('pre-line');
    expect(style.textTransform).toBe('none');
    expect(style.textShadow).toBe('none');
  });

  it('leaves the notes out for a spot without any', () => {
    create(loaded(detail({ notes: null })));
    expect(find('.spot-detail__notes')).toBeNull();
  });

  it('links directions to the spot in a new browsing context', () => {
    create(loaded());
    const directions = find<HTMLAnchorElement>('a.spot-detail__action')!;
    expect(text(directions)).toBe('> DIRECTIONS');
    expect(directions.getAttribute('href')).toBe(
      directionsUrl([16.3785491, 48.1840844]),
    );
    expect(directions.getAttribute('target')).toBe('_blank');
    expect(directions.getAttribute('rel')).toBe('noopener noreferrer');
    expect(directions.getAttribute('aria-label')).toBe(
      'Directions to Alpha Bank',
    );
  });

  it('gives both actions the pointer bloom on a thumb-sized plate', () => {
    create(loaded());
    const actions = Array.from(
      host().querySelectorAll<HTMLElement>('.spot-detail__action'),
    );
    expect(actions.map(text)).toEqual(['> DIRECTIONS', '> SHARE SPOT']);
    for (const action of actions) {
      expect(action.classList).toContain('phosphor-bloom');
      expect(action.classList).toContain('phosphor-bloom--plate');
      expect(action.offsetHeight).toBeGreaterThanOrEqual(44);
    }
    expect(shareButton().getAttribute('aria-label')).toBe('Share Alpha Bank');
  });

  it('shares through the native sheet and shows no line for it', async () => {
    const share = jasmine.createSpy('share').and.resolveTo();
    create(loaded(), {
      nav: { share, canShare: () => true } as unknown as ShareNavigator,
    });
    shareButton().click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(share).toHaveBeenCalledOnceWith({
      url: jasmine.stringMatching(/\/spot\/a-1$/),
      title: 'Alpha Bank',
    });
    expect(shareStatus()).toBe('');
  });

  it('copies the link where there is no share sheet, and says so', async () => {
    create(loaded());
    shareButton().click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledOnceWith(
      jasmine.stringMatching(/\/spot\/a-1$/),
    );
    expect(shareStatus()).toBe('> LINK COPIED');
    expect(find('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('says so when the copy is refused', async () => {
    writeText.and.rejectWith(new DOMException('denied', 'NotAllowedError'));
    create(loaded());
    shareButton().click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(shareStatus()).toBe('> COPY FAILED // LINK NOT COPIED');
  });

  it('clears the share line after a few seconds', fakeAsync(() => {
    create(loaded());
    shareButton().click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(shareStatus()).toBe('> LINK COPIED');
    tick(SHARE_STATUS_MS);
    fixture.detectChanges();
    expect(shareStatus()).toBe('');
  }));

  it('cancels a pending share-line timer when it is destroyed', fakeAsync(() => {
    create(loaded());
    shareButton().click();
    flushMicrotasks();
    fixture.destroy();
    // fakeAsync fails the spec on a timer still queued here: destroy must have cleared it.
    expect(fixture.componentRef.hostView.destroyed).toBeTrue();
  }));

  it('shows what the list knows at once while the file loads', () => {
    create(loading());
    expect(text(find('.spot-detail__name'))).toBe('Alpha Bank');
    expect(
      find<HTMLImageElement>('.spot-detail__cover')!.getAttribute('src'),
    ).toBe('https://photos.test/thumb/vienna/a-1-1.webp');
    expect(find('.spot-detail__strip-reserved')).not.toBeNull();
    expect(text(find('.spot-detail__line'))).toBe('> LOADING FILE…');
    expect(find('app-spot-photo-gallery')).toBeNull();
    expect(find('.spot-detail__actions')).toBeNull();
  });

  it('keeps the name where it is when the full file replaces the preview', () => {
    create(loading());
    const before = find('.spot-detail__name')!.getBoundingClientRect().top;
    const reserved = find('.spot-detail__reserved')!.getBoundingClientRect();
    expect(reserved.height).toBeCloseTo((reserved.width * 3) / 4, 0);
    show(loaded());
    expect(find('.spot-detail__name')!.getBoundingClientRect().top).toBe(
      before,
    );
  });

  it('reserves no strip for a preview with one photo', () => {
    create(loading(preview({ photoCount: 1 })));
    expect(find('.spot-detail__reserved')).not.toBeNull();
    expect(find('.spot-detail__strip-reserved')).toBeNull();
  });

  it('reserves no photo room for a preview without photos', () => {
    create(loading(preview({ cover: null, photoCount: 0 })));
    expect(find('.spot-detail__reserved')).toBeNull();
    expect(find('.spot-detail__rights')).toBeNull();
  });

  it('reserves the 4:3 box for a cold link and names nothing it does not know', () => {
    create(loading(null));
    expect(find('.spot-detail__reserved')).not.toBeNull();
    expect(find('.spot-detail__cover')).toBeNull();
    expect(find('.spot-detail__name')!.classList).toContain('sr-only');
    expect(text(find('.spot-detail__line'))).toBe('> LOADING FILE…');
  });

  it('reserves nothing for a cold link without a photo host', () => {
    create(loading(null), { backend: UNCONFIGURED_BACKEND });
    expect(find('.spot-detail__reserved')).toBeNull();
  });

  it('crossfades the full file in', () => {
    create(loaded());
    const facts = getComputedStyle(find('.spot-detail__fade-in')!);
    expect(facts.transitionProperty).toContain('opacity');
    expect(facts.transitionDuration).toBe('0.3s');
  });

  it('says the file is unreachable and offers a retry', () => {
    create(failed());
    expect(text(find('.spot-detail__name'))).toBe('Alpha Bank');
    const line = find('.spot-detail__line')!;
    expect(text(line)).toBe('> SIGNAL LOST // FILE UNREACHABLE');
    expect(getComputedStyle(line).textShadow).not.toBe('none');
    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => (retried += 1));
    const retry = Array.from(host().querySelectorAll('button')).find(
      (button) => text(button) === '> RETRY',
    )!;
    expect(retry.classList).toContain('phosphor-bloom--plate');
    retry.click();
    expect(retried).toBe(1);
  });

  it('moves focus to the heading when a spot opens', async () => {
    create(loaded());
    await fixture.whenStable();
    expect(document.activeElement).toBe(find('h2'));
  });

  it('keeps focus on the heading as the file arrives for the same spot', async () => {
    create(loading(null));
    await fixture.whenStable();
    const heading = find('h2');
    expect(document.activeElement).toBe(heading);
    show(loaded());
    await fixture.whenStable();
    expect(find('h2')).toBe(heading);
    expect(document.activeElement).toBe(heading);
  });

  it('moves focus again only for another spot', async () => {
    create(loaded());
    await fixture.whenStable();
    (document.activeElement as HTMLElement).blur();
    show(loaded(detail({ notes: 'changed' })));
    await fixture.whenStable();
    expect(document.activeElement).not.toBe(find('h2'));
    show(loaded(detail({ id: 'b-2', name: 'Beta Ledge' })));
    await fixture.whenStable();
    expect(document.activeElement).toBe(find('h2'));
  });

  it('opens another spot on its first photo', async () => {
    create(loaded());
    stripButtons()[2].click();
    fixture.detectChanges();
    show(loaded(detail({ id: 'b-2', name: 'Beta Ledge' })));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(find('.gallery__counter'))).toBe('[1/3]');
  });

  it('uses amber for nothing but the current strip photo’s frame', () => {
    create(loaded(detail({ status: 'demolished' })));
    const amber = painted('var(--color-amber)');
    const hits: string[] = [];
    for (const element of Array.from(host().querySelectorAll('*'))) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        for (const property of [
          'color',
          'border-top-color',
          'outline-color',
          'background-color',
          'text-shadow',
          'box-shadow',
        ]) {
          const value = style.getPropertyValue(property);
          const visible =
            property !== 'border-top-color' ||
            style.getPropertyValue('border-top-style') !== 'none';
          if (visible && value.includes(amber)) {
            hits.push(`${element.className}${pseudo ?? ''} ${property}`);
          }
        }
      }
    }
    expect(hits).toEqual([
      'spot-detail__strip-photo phosphor-bloom phosphor-bloom--inset is-current::after border-top-color',
    ]);
  });

  it('sets no text below 12 px', () => {
    create(loaded(detail({ status: 'demolished' })));
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
