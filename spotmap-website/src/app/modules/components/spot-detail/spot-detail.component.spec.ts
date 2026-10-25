import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

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
import { SpotPhotoRailComponent } from '../spot-photo-rail/spot-photo-rail.component';
import {
  PHOTO_VIEWER_LOADER,
  type PhotoViewerLoader,
} from '../spot-photo-viewer/photo-viewer-loader';
import type { PhotoViewerRequest } from '../spot-photo-viewer/spot-photo-viewer';
import { SpotShareComponent } from '../spot-share/spot-share.component';
import { directionsUrl } from './directions';
import { SHARE_NAVIGATOR, ShareNavigator } from './share-spot';
import { SpotDetailComponent } from './spot-detail.component';

/** A backend with a photo host, so the rail and covers render. */
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

/** A navigator with no share sheet, so the share control is a plain COPY LINK plate. */
const COPY_ONLY = {
  clipboard: { writeText: () => Promise.resolve() },
} as unknown as ShareNavigator;

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
  let viewer: { open: jasmine.Spy };
  let closeViewer: jasmine.Spy;
  /** The fake loader; by default it resolves the fake viewer at once. */
  let loadViewer: jasmine.Spy<PhotoViewerLoader>;

  beforeEach(() => {
    closeViewer = jasmine.createSpy('close');
    viewer = {
      open: jasmine.createSpy('open').and.returnValue({ close: closeViewer }),
    };
    loadViewer = jasmine
      .createSpy<PhotoViewerLoader>('loadViewer')
      .and.callFake(() => Promise.resolve(viewer));
  });

  /**
   * Makes the loader hold every load until the returned `resolve` or `reject` is called, as the
   * viewer's chunk does while it downloads.
   */
  function holdLoad(): { resolve: () => void; reject: () => void } {
    let resolve!: () => void;
    let reject!: () => void;
    const pending = new Promise<typeof viewer>((done, fail) => {
      resolve = () => done(viewer);
      reject = () => fail(new Error('chunk failed'));
    });
    loadViewer.and.returnValue(pending);
    return { resolve, reject };
  }

  afterEach(() => fixture?.destroy());

  function create(
    view: SpotDetailView,
    {
      backend = BACKEND,
      hostStyle = 'display:block;width:320px',
    }: { backend?: SpotmapBackend; hostStyle?: string } = {},
  ): ComponentFixture<SpotDetailComponent> {
    TestBed.configureTestingModule({
      // The failed and loading lines leave with a real fade; TestBed skips those by default.
      animationsEnabled: true,
      imports: [SpotDetailComponent],
      providers: [
        { provide: SPOTMAP_BACKEND, useValue: backend },
        { provide: SHARE_NAVIGATOR, useValue: COPY_ONLY },
        { provide: PHOTO_VIEWER_LOADER, useValue: loadViewer },
      ],
    });
    fixture = TestBed.createComponent(SpotDetailComponent);
    // A definite width, as the list column and the sheet give it.
    (fixture.nativeElement as HTMLElement).style.cssText = hostStyle;
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
  const rect = (selector: string) => find(selector)!.getBoundingClientRect();
  const rail = () =>
    fixture.debugElement.query(By.directive(SpotPhotoRailComponent))
      ?.componentInstance as SpotPhotoRailComponent | undefined;
  const share = () =>
    fixture.debugElement.query(By.directive(SpotShareComponent))
      ?.componentInstance as SpotShareComponent | undefined;
  /** The request the last `SpotPhotoViewer.open` call carried, and the element focus returns to. */
  const lastOpen = () =>
    viewer.open.calls.mostRecent().args as [PhotoViewerRequest, HTMLElement];
  /** Lets a photo open that waits on the viewer's load go through. */
  const settle = () => fixture.whenStable();
  /** Waits until the browser is idle, after any idle work the detail scheduled first. */
  const idle = () =>
    new Promise<void>((done) => requestIdleCallback(() => done()));

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

  it('lays a spot out as rail, rights, name, notes, then actions', () => {
    create(loaded());
    expectInOrder([
      'app-spot-photo-rail',
      '.spot-detail__rights',
      '.spot-detail__name',
      '.spot-detail__notes',
      '.spot-detail__actions',
    ]);
    expect(find('app-spot-photo-gallery')).toBeNull();
    expect(find('.spot-detail__strip')).toBeNull();
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

  it('builds the rail from the photos’ thumbnails', () => {
    create(loaded());
    expect(rail()!.photos()).toEqual([
      'https://photos.test/thumb/vienna/a-1-1.webp',
      'https://photos.test/thumb/vienna/a-1-2.webp',
      'https://photos.test/thumb/vienna/a-1-3.webp',
    ]);
    expect(rail()!.spotName()).toBe('Alpha Bank');
  });

  it('shows the rail and the rights line for a single photo', () => {
    create(loaded(detail({ photos: ['vienna/a-1-1.webp'] })));
    expect(rail()!.photos().length).toBe(1);
    expect(find('.spot-detail__rights')).not.toBeNull();
  });

  it('starts at the name for a spot without photos', () => {
    create(loaded(detail({ photos: [] })));
    expect(find('app-spot-photo-rail')).toBeNull();
    expect(find('.spot-detail__rights')).toBeNull();
  });

  it('starts at the name when no photo host is configured', () => {
    create(loaded(), { backend: UNCONFIGURED_BACKEND });
    expect(find('app-spot-photo-rail')).toBeNull();
    expect(find('.spot-detail__rights')).toBeNull();
    expect(find('.spot-detail__name')).not.toBeNull();
  });

  it('opens the viewer on the rail photo chosen, growing out of it', async () => {
    create(loaded());
    rail()!.open.emit(1);
    await settle();
    expect(viewer.open).toHaveBeenCalledTimes(1);
    const [request, opener] = lastOpen();
    expect(request.spotName).toBe('Alpha Bank');
    expect(request.index).toBe(1);
    expect(request.thumbs).toEqual(rail()!.photos());
    expect(request.fulls).toEqual([
      'https://photos.test/full/vienna/a-1-1.webp',
      'https://photos.test/full/vienna/a-1-2.webp',
      'https://photos.test/full/vienna/a-1-3.webp',
    ]);
    expect(opener).toBe(rail()!.photoButton(1)!);
    expect(request.originOf(2)).toBe(rail()!.photoButton(2));
    expect(request.originOf(3)).toBeNull();
  });

  it('opens the viewer when a rail photo is clicked', async () => {
    create(loaded());
    (rail()!.photoButton(2) as HTMLButtonElement).click();
    await settle();
    expect(lastOpen()[0].index).toBe(2);
  });

  it('closes the viewer when another spot opens', async () => {
    create(loaded());
    rail()!.open.emit(0);
    await settle();
    show(loading(preview({ id: 'b-2', name: 'Beta Ledge' }), 'b-2'));
    expect(closeViewer).toHaveBeenCalledTimes(1);
  });

  it('closes the viewer when it is destroyed', async () => {
    create(loaded());
    rail()!.open.emit(0);
    await settle();
    fixture.destroy();
    expect(closeViewer).toHaveBeenCalledTimes(1);
  });

  it('leaves the viewer open while the same spot only re-renders', async () => {
    create(loaded());
    rail()!.open.emit(0);
    await settle();
    show(loaded(detail({ notes: 'changed' })));
    expect(closeViewer).not.toHaveBeenCalled();
  });

  it('loads the viewer when the browser is first idle, before any photo is chosen', async () => {
    create(loaded());
    await idle();
    expect(loadViewer).toHaveBeenCalledTimes(1);
    expect(viewer.open).not.toHaveBeenCalled();
  });

  it('opens a photo chosen while the viewer still loads once it has loaded', async () => {
    const load = holdLoad();
    create(loaded());
    rail()!.open.emit(1);
    await settle();
    expect(viewer.open).not.toHaveBeenCalled();
    load.resolve();
    await settle();
    expect(viewer.open).toHaveBeenCalledTimes(1);
    expect(lastOpen()[0].index).toBe(1);
  });

  it('drops a pending open when another spot opens before the viewer loads', async () => {
    const load = holdLoad();
    create(loaded());
    rail()!.open.emit(0);
    show(loading(preview({ id: 'b-2', name: 'Beta Ledge' }), 'b-2'));
    load.resolve();
    await settle();
    expect(viewer.open).not.toHaveBeenCalled();
  });

  it('drops a pending open when the detail goes before the viewer loads', async () => {
    const load = holdLoad();
    create(loaded());
    rail()!.open.emit(0);
    fixture.destroy();
    load.resolve();
    await settle();
    expect(viewer.open).not.toHaveBeenCalled();
  });

  it('opens only the last of several photos chosen while the viewer loads', async () => {
    const load = holdLoad();
    create(loaded());
    rail()!.open.emit(0);
    rail()!.open.emit(2);
    load.resolve();
    await settle();
    expect(viewer.open).toHaveBeenCalledTimes(1);
    expect(lastOpen()[0].index).toBe(2);
  });

  it('keeps the rail usable when the viewer fails to load, and retries on the next photo', async () => {
    const load = holdLoad();
    create(loaded());
    rail()!.open.emit(0);
    load.reject();
    await settle();
    expect(viewer.open).not.toHaveBeenCalled();
    loadViewer.and.callFake(() => Promise.resolve(viewer));
    rail()!.open.emit(1);
    await settle();
    expect(viewer.open).toHaveBeenCalledTimes(1);
    expect(lastOpen()[0].index).toBe(1);
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
    expect(directions.classList).toContain('phosphor-bloom');
    expect(directions.classList).toContain('phosphor-bloom--plate');
    expect(directions.offsetHeight).toBeGreaterThanOrEqual(44);
  });

  it('hands the share action to the share control, beside the directions', () => {
    create(loaded());
    expectInOrder(['a.spot-detail__action', 'app-spot-share']);
    expect(share()!.spotId()).toBe('a-1');
    expect(share()!.spotName()).toBe('Alpha Bank');
    expect(find('[role="status"].spot-detail__share-status')).toBeNull();
  });

  it('insets its content 16 px from the panel on every side', () => {
    create(loaded());
    const style = getComputedStyle(host());
    expect(
      [
        style.paddingTop,
        style.paddingRight,
        style.paddingBottom,
        style.paddingLeft,
      ].every((value) => value === '16px'),
    ).toBeTrue();
    const panel = host().getBoundingClientRect();
    expect(rect('.spot-detail__name').left).toBe(panel.left + 16);
    expect(rect('.spot-detail__actions').left).toBe(panel.left + 16);
  });

  it('lets the rail bleed to the panel’s edges with its first photo on the inset', () => {
    create(loaded());
    const panel = host().getBoundingClientRect();
    const scroller = rect('app-spot-photo-rail');
    expect(scroller.left).toBe(panel.left);
    expect(scroller.right).toBe(panel.right);
    expect(rail()!.photoButton(0)!.getBoundingClientRect().left).toBe(
      panel.left + 16,
    );
  });

  it('spaces its groups 16 px apart and the items inside a group 8 px apart', () => {
    create(loaded(detail({ status: 'demolished' })));
    const railBox = rect('app-spot-photo-rail');
    const rights = rect('.spot-detail__rights');
    const name = rect('.spot-detail__name');
    const notes = rect('.spot-detail__notes');
    const status = rect('.spot-detail__status');
    const actions = rect('.spot-detail__actions');
    expect(rights.top - railBox.bottom).toBeCloseTo(8, 0);
    expect(name.top - rights.bottom).toBeCloseTo(16, 0);
    expect(notes.top - name.bottom).toBeCloseTo(8, 0);
    expect(status.top - notes.bottom).toBeCloseTo(16, 0);
    expect(actions.top - status.bottom).toBeCloseTo(16, 0);
  });

  it('keeps a group’s 16 px after the name when there are no notes', () => {
    create(loaded(detail({ notes: null, status: 'demolished' })));
    expect(
      rect('.spot-detail__status').top - rect('.spot-detail__name').bottom,
    ).toBeCloseTo(16, 0);
  });

  it('keeps the failed line where the loading line sat, 8 px under the name', () => {
    create(loading());
    const loadingTop = rect('.spot-detail__line--dim').top;
    expect(loadingTop - rect('.spot-detail__name').bottom).toBeCloseTo(8, 0);
    show(failed());
    expect(rect('.spot-detail__line--lit').top).toBe(loadingTop);
  });

  it('spaces the two action plates 8 px apart', () => {
    // A phone-width sheet: at 320 px the two plates wrap onto two rows, as they are meant to.
    create(loaded(), { hostStyle: 'display:block;width:375px' });
    const directions = rect('a.spot-detail__action');
    const shareBox = rect('app-spot-share');
    expect(shareBox.left - directions.right).toBeCloseTo(8, 0);
  });

  it('shows what the list knows at once while the file loads', () => {
    create(loading());
    expect(text(find('.spot-detail__name'))).toBe('Alpha Bank');
    expect(
      find<HTMLImageElement>('.spot-detail__cover')!.getAttribute('src'),
    ).toBe('https://photos.test/thumb/vienna/a-1-1.webp');
    expect(text(find('.spot-detail__line'))).toBe('> LOADING FILE…');
    expect(find('app-spot-photo-rail')).toBeNull();
    expect(find('.spot-detail__actions')).toBeNull();
  });

  it('reserves the rail’s first frame exactly, so the rail and the name land without a jump', () => {
    create(loading());
    const reserved = rect('.spot-detail__reserved');
    const nameTop = rect('.spot-detail__name').top;
    const height = window.matchMedia('(min-width: 1024px)').matches ? 132 : 112;
    expect(reserved.height).toBe(height);
    expect(reserved.width).toBeCloseTo((height * 4) / 3, 0);
    expect(reserved.left).toBe(host().getBoundingClientRect().left + 16);
    show(loaded());
    const frame = rail()!.photoButton(0)!.getBoundingClientRect();
    expect(frame.top).toBe(reserved.top);
    expect(frame.left).toBe(reserved.left);
    expect(frame.height).toBe(reserved.height);
    expect(rect('.spot-detail__name').top).toBe(nameTop);
  });

  it('reserves no photo room for a preview without photos', () => {
    create(loading(preview({ cover: null, photoCount: 0 })));
    expect(find('.spot-detail__reserved')).toBeNull();
    expect(find('.spot-detail__rights')).toBeNull();
  });

  it('reserves the rail’s frame for a cold link and names nothing it does not know', () => {
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

  it('keeps the reserved frame and the name in place when the file cannot be loaded', () => {
    create(loading());
    const nameTop = rect('.spot-detail__name').top;
    show(failed());
    expect(find('.spot-detail__reserved')).not.toBeNull();
    expect(
      find<HTMLImageElement>('.spot-detail__cover')!.getAttribute('src'),
    ).toBe('https://photos.test/thumb/vienna/a-1-1.webp');
    expect(rect('.spot-detail__name').top).toBe(nameTop);
  });

  it('keeps the name in place through RETRY, from failed to loading to loaded', () => {
    create(failed());
    const nameTop = rect('.spot-detail__name').top;
    show(loading());
    expect(rect('.spot-detail__name').top).toBe(nameTop);
    show(loaded());
    expect(rect('.spot-detail__name').top).toBe(nameTop);
  });

  it('fades the loading line in over the failed line, in the same cell, instead of cutting', async () => {
    create(failed());
    await Promise.all(
      host()
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
    show(loading());

    // The failed line is still up, fading out under the loading line that fades in.
    const leaving = find('.spot-detail__fade-in--leaving');
    expect(text(leaving)).toContain('> SIGNAL LOST // FILE UNREACHABLE');

    const loadingLine = Array.from(
      host().querySelectorAll<HTMLElement>('.spot-detail__line--dim'),
    ).find((line) => text(line) === '> LOADING FILE…')!;
    const style = getComputedStyle(loadingLine);
    expect(style.transitionProperty).toContain('opacity');
    // Just inserted: still at the start of its fade-in.
    expect(parseFloat(style.opacity)).toBeLessThan(0.5);
    // One grid cell holds whichever lines are up, so a line leaving never pushes the next one down.
    expect(getComputedStyle(find('.spot-detail__state')!).display).toBe('grid');
  });

  it('moves focus to the heading when RETRY is pressed, so it is not dropped with the button', async () => {
    create(failed());
    await fixture.whenStable();
    const retry = Array.from(host().querySelectorAll('button')).find(
      (button) => text(button) === '> RETRY',
    )!;
    retry.focus();
    expect(document.activeElement).toBe(retry);

    show(loading());
    await fixture.whenStable();

    expect(document.activeElement).toBe(find('h2'));
  });

  it('holds the rail’s frame for a cold link whose file cannot be loaded', () => {
    create(failed(null));
    expect(find('.spot-detail__reserved')).not.toBeNull();
    expect(find('.spot-detail__cover')).toBeNull();
  });

  it('reserves nothing for a failed file whose preview had no photos', () => {
    create(failed(preview({ cover: null, photoCount: 0 })));
    expect(find('.spot-detail__reserved')).toBeNull();
    expect(find('.spot-detail__rights')).toBeNull();
  });

  it('focuses the heading without scrolling the pane to it', async () => {
    const focus = spyOn(HTMLElement.prototype, 'focus').and.callThrough();
    create(loaded());
    await fixture.whenStable();
    const heading = find('h2')!;
    const calls = focus.calls
      .all()
      .filter((call) => call.object === heading)
      .map((call) => call.args[0]);
    expect(calls).toEqual([{ preventScroll: true }]);
  });

  it('opens another spot at the top of the pane', async () => {
    create(loaded(), {
      hostStyle: 'display:block;width:320px;height:100px;overflow-y:auto',
    });
    await fixture.whenStable();
    host().scrollTop = 120;
    expect(host().scrollTop).toBeGreaterThan(0);
    show(loaded(detail({ id: 'b-2', name: 'Beta Ledge' })));
    await fixture.whenStable();
    expect(host().scrollTop).toBe(0);
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

  it('uses no amber at all: nothing in the detail is the current selection', () => {
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
    expect(hits).toEqual([]);
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
