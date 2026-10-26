import { Dialog } from '@angular/cdk/dialog';
import {
  LocationChangeEvent,
  LocationChangeListener,
  LocationStrategy,
  PlatformLocation,
} from '@angular/common';
import { MockLocationStrategy } from '@angular/common/testing';
import { ApplicationRef } from '@angular/core';
import {
  fakeAsync,
  flush,
  flushMicrotasks,
  TestBed,
  tick,
} from '@angular/core/testing';
import {
  PhotoViewerHandle,
  PhotoViewerRequest,
  SpotPhotoViewer,
} from './spot-photo-viewer';
import { VIEWER_FADE_MS, VIEWER_GROW_MS } from './spot-photo-viewer.component';

/**
 * Angular's `PlatformLocation`, cut down to what the viewer uses, with a history stack the spec
 * can read. `back()` and the visitor's Back both pop an entry and report `popstate`.
 */
class FakePlatformLocation {
  readonly href = 'http://localhost/spot/a-1';
  /** The entries, oldest first; the last is the current one. */
  readonly entries: unknown[] = [{ navigationId: 2 }];
  /** How many times the viewer itself went back. */
  backs = 0;
  /** The popstate listeners still registered. */
  listeners: LocationChangeListener[] = [];

  getState(): unknown {
    return this.entries.at(-1);
  }
  pushState(state: unknown): void {
    this.entries.push(state);
  }
  back(): void {
    this.backs++;
    this.pop();
  }
  onPopState(fn: LocationChangeListener): VoidFunction {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== fn);
    };
  }
  /** The visitor pressing the browser's Back. */
  pressBack(): void {
    this.pop();
  }
  private pop(): void {
    this.entries.pop();
    const event = {
      type: 'popstate',
      state: this.getState(),
    } as LocationChangeEvent;
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

/** One `Element.animate` call the viewer made. */
interface AnimationCall {
  readonly element: Element;
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
}

describe('SpotPhotoViewer', () => {
  let location: FakePlatformLocation;
  let opener: HTMLButtonElement;
  let origin: HTMLElement;
  let handle: PhotoViewerHandle;
  let animations: AnimationCall[];

  beforeEach(() => {
    location = new FakePlatformLocation();
    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformLocation, useValue: location },
        // The CDK overlay injects `Location`, whose default strategy would read the base href from
        // the fake and register a second popstate listener on it; the mock strategy keeps the fake
        // the viewer's alone.
        { provide: LocationStrategy, useClass: MockLocationStrategy },
      ],
    });
    // Every animation finishes at once, so the motion's sequence can be stepped through.
    animations = [];
    spyOn(Element.prototype, 'animate').and.callFake(function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      animations.push({
        element: this,
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
      });
      return {
        finished: Promise.resolve(),
        cancel: () => undefined,
      } as unknown as Animation;
    });
    opener = document.createElement('button');
    opener.textContent = 'Open photo 2 of 3';
    document.body.append(opener);
    opener.focus();
    // The rail photo the viewer grows out of: on screen, 4:3.
    origin = document.createElement('div');
    origin.style.cssText =
      'position: fixed; left: 10px; top: 20px; width: 132px; height: 99px;';
    document.body.append(origin);
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    opener.remove();
    origin.remove();
  });

  function request(
    overrides: Partial<PhotoViewerRequest> = {},
  ): PhotoViewerRequest {
    return {
      spotName: 'Alpha Bank',
      thumbs: ['t1.webp', 't2.webp', 't3.webp'],
      fulls: ['f1.webp', 'f2.webp', 'f3.webp'],
      index: 1,
      originOf: () => origin,
      ...overrides,
    };
  }

  /** Renders, runs the render hooks and lets every finished animation's continuation run. */
  function settle(): void {
    const app = TestBed.inject(ApplicationRef);
    app.tick();
    flushMicrotasks();
    app.tick();
  }

  /** Opens the viewer on `request(overrides)` and lets it land. */
  function open(overrides: Partial<PhotoViewerRequest> = {}): void {
    handle = TestBed.inject(SpotPhotoViewer).open(request(overrides), opener);
    settle();
    expect(dialog()).withContext('the viewer opened').not.toBeNull();
  }

  /** Runs a close that has started: the controls' fade, then the shrink and the scrim. */
  function finishClose(): void {
    tick(VIEWER_FADE_MS);
    settle();
  }

  const dialog = () =>
    document.querySelector<HTMLElement>('.cdk-dialog-container');
  const viewer = () =>
    document.querySelector<HTMLElement>('app-spot-photo-viewer');
  const q = <T extends Element = HTMLElement>(selector: string) =>
    document.querySelector<T>(`app-spot-photo-viewer ${selector}`);
  const counter = () => q('.viewer__counter')?.textContent?.trim();
  const stageMoves = () =>
    animations.filter((call) =>
      call.element.classList.contains('viewer__stage'),
    );

  /** A key pressed inside the dialog. */
  function key(name: string): void {
    dialog()!.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true }),
    );
    settle();
  }

  /** What the browser paints for a colour token. */
  function painted(value: string): string {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }

  it('opens a modal dialog named for the spot’s photos, over an 82 % black scrim', fakeAsync(() => {
    open();
    expect(dialog()!.getAttribute('role')).toBe('dialog');
    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    expect(dialog()!.getAttribute('aria-label')).toBe('Photos of Alpha Bank');
    const scrim = document.querySelector('.spot-photo-viewer-backdrop')!;
    expect(getComputedStyle(scrim).backgroundColor).toBe('rgba(0, 0, 0, 0.82)');
    flush();
  }));

  it('shows the photo it was opened on, the spot’s name and the counter', fakeAsync(() => {
    open();
    expect(q('.viewer__name')!.textContent!.trim()).toBe('Alpha Bank');
    expect(counter()).toBe('[2/3]');
    expect(q('.gallery__photo')!.getAttribute('src')).toBe('t2.webp');
    expect(q('.gallery__full')!.getAttribute('src')).toBe('f2.webp');
    flush();
  }));

  it('moves focus into the dialog and traps it there', fakeAsync(() => {
    open();
    expect(dialog()!.contains(document.activeElement)).toBeTrue();
    expect(
      document.querySelector('.cdk-overlay-container .cdk-focus-trap-anchor'),
    ).not.toBeNull();
    flush();
  }));

  it('grows the photo out of its rail photo, and only then fades the controls in', fakeAsync(() => {
    handle = TestBed.inject(SpotPhotoViewer).open(request(), opener);
    const app = TestBed.inject(ApplicationRef);
    app.tick();
    const [grow] = stageMoves();
    expect(grow.options.duration).toBe(VIEWER_GROW_MS);
    expect(String(grow.keyframes[0]['transform'])).toMatch(
      /^translate\(.+px, .+px\) scale\(.+, .+\)$/,
    );
    expect(grow.keyframes[1]['transform']).toBe('none');
    expect(viewer()!.classList).not.toContain('viewer--controls');

    flushMicrotasks();
    app.tick();
    expect(viewer()!.classList).toContain('viewer--controls');
    expect(q('.gallery__controls')!.classList).not.toContain(
      'gallery__controls--hidden',
    );
    flush();
  }));

  it('keeps the controls inert until the photo has landed', fakeAsync(() => {
    handle = TestBed.inject(SpotPhotoViewer).open(request(), opener);
    TestBed.inject(ApplicationRef).tick();
    expect(q<HTMLElement>('.viewer__plates')!.inert).toBeTrue();
    expect(q<HTMLElement>('.viewer__strip')!.inert).toBeTrue();
    settle();
    expect(q<HTMLElement>('.viewer__plates')!.inert).toBeFalse();
    expect(q<HTMLElement>('.viewer__strip')!.inert).toBeFalse();
    flush();
  }));

  it('fades the photo in, with no growth, under reduced motion', fakeAsync(() => {
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
        }) as MediaQueryList,
    );
    open();
    const [fade] = stageMoves();
    expect(fade.keyframes.map((frame) => frame['opacity'])).toEqual([0, 1]);
    expect(
      stageMoves().every((call) =>
        call.keyframes.every((frame) => !('transform' in frame)),
      ),
    ).toBeTrue();
    expect(viewer()!.classList).toContain('viewer--controls');
    flush();
  }));

  it('fades the photo in when there is no rail photo to grow from', fakeAsync(() => {
    open({ originOf: () => null });
    const [fade] = stageMoves();
    expect(fade.keyframes.map((frame) => frame['opacity'])).toEqual([0, 1]);
    flush();
  }));

  it('steps with the plates and the arrow keys, wrapping at both ends', fakeAsync(() => {
    open();
    key('ArrowRight');
    expect(counter()).toBe('[3/3]');
    key('ArrowRight');
    expect(counter()).toBe('[1/3]');
    key('ArrowLeft');
    expect(counter()).toBe('[3/3]');
    q<HTMLButtonElement>('.gallery__nav--prev')!.click();
    settle();
    expect(counter()).toBe('[2/3]');
    expect(q('.gallery__photo')!.getAttribute('src')).toBe('t2.webp');
    flush();
  }));

  it('jumps to a strip photo and frames the current one in amber', fakeAsync(() => {
    open();
    const thumbs = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'app-spot-photo-viewer .viewer__thumb',
      ),
    );
    expect(thumbs.map((thumb) => thumb.getAttribute('aria-label'))).toEqual([
      'Photo 1 of 3',
      'Photo 2 of 3',
      'Photo 3 of 3',
    ]);
    thumbs[2].click();
    settle();
    expect(counter()).toBe('[3/3]');
    expect(thumbs.map((thumb) => thumb.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'true',
    ]);
    // The frame eases between colours; cutting the transition short reads where it settles.
    for (const thumb of thumbs) {
      thumb.querySelector('img')!.style.transition = 'none';
    }
    expect(getComputedStyle(thumbs[2].querySelector('img')!).outlineColor).toBe(
      painted('var(--color-amber)'),
    );
    expect(
      getComputedStyle(thumbs[0].querySelector('img')!).outlineColor,
    ).not.toBe(painted('var(--color-amber)'));
    flush();
  }));

  it('eases the strip frame’s width and offset along with its colour', fakeAsync(() => {
    open();
    const image = document.querySelector<HTMLImageElement>(
      'app-spot-photo-viewer .viewer__thumb img',
    )!;
    const style = getComputedStyle(image);
    const properties = style.transitionProperty
      .split(',')
      .map((name) => name.trim());
    expect(properties).toEqual(
      jasmine.arrayContaining([
        'opacity',
        'outline-color',
        'outline-width',
        'outline-offset',
      ]),
    );
    // One shared timing, so the frame's width, offset and colour move as one.
    expect(
      new Set(style.transitionDuration.split(',').map((time) => time.trim()))
        .size,
    ).toBe(1);
    flush();
  }));

  it('leaves the strip out for a single photo', fakeAsync(() => {
    open({ thumbs: ['t1.webp'], fulls: ['f1.webp'], index: 0 });
    expect(q('.viewer__strip')).toBeNull();
    expect(counter()).toBe('[1/1]');
    flush();
  }));

  it('announces a step politely, and nothing on opening', fakeAsync(() => {
    open();
    const region = q('[aria-live="polite"]')!;
    expect(region.textContent!.trim()).toBe('');
    key('ArrowRight');
    expect(region.textContent!.trim()).toBe('Photo 3 of 3');
    flush();
  }));

  it('pushes one history entry that keeps the page’s own state', fakeAsync(() => {
    open();
    expect(location.entries).toEqual([
      { navigationId: 2 },
      { navigationId: 2, spotPhotoViewer: true },
    ]);
    flush();
  }));

  it('closes from ✕: the controls fade, the photo shrinks into its rail photo, the scrim fades, the entry is consumed and focus returns', fakeAsync(() => {
    open();
    animations.length = 0;
    q<HTMLButtonElement>('.viewer__close')!.click();
    settle();
    expect(viewer()!.classList).not.toContain('viewer--controls');
    expect(dialog())
      .withContext('still open while the controls fade')
      .not.toBeNull();
    expect(stageMoves()).toEqual([]);

    finishClose();
    const [shrink] = stageMoves();
    expect(shrink.keyframes[0]['transform']).toBe('none');
    expect(String(shrink.keyframes[1]['transform'])).toMatch(/^translate\(/);
    expect(
      animations.some((call) =>
        call.element.classList.contains('spot-photo-viewer-backdrop'),
      ),
    ).toBeTrue();
    expect(dialog()).toBeNull();
    expect(location.backs).toBe(1);
    expect(location.entries).toEqual([{ navigationId: 2 }]);
    expect(document.activeElement).toBe(opener);
    flush();
  }));

  it('closes on Escape, consuming its entry', fakeAsync(() => {
    open();
    key('Escape');
    finishClose();
    expect(dialog()).toBeNull();
    expect(location.backs).toBe(1);
    flush();
  }));

  it('closes on a click on the scrim, consuming its entry', fakeAsync(() => {
    open();
    document.querySelector<HTMLElement>('.spot-photo-viewer-backdrop')!.click();
    settle();
    finishClose();
    expect(dialog()).toBeNull();
    expect(location.backs).toBe(1);
    flush();
  }));

  it('closes on the browser’s Back and leaves the spot’s own entry alone', fakeAsync(() => {
    open();
    location.pressBack();
    settle();
    finishClose();
    expect(dialog()).toBeNull();
    expect(location.backs).toBe(0);
    expect(location.entries).toEqual([{ navigationId: 2 }]);
    flush();
  }));

  it('fades the photo out when its rail photo has gone off screen', fakeAsync(() => {
    open();
    animations.length = 0;
    origin.style.left = '-500px';
    key('Escape');
    finishClose();
    const [fade] = stageMoves();
    expect(fade.keyframes.map((frame) => frame['opacity'])).toEqual([1, 0]);
    flush();
  }));

  it('runs one close however many ways it is asked for', fakeAsync(() => {
    open();
    q<HTMLButtonElement>('.viewer__close')!.click();
    key('Escape');
    location.pressBack();
    finishClose();
    expect(dialog()).toBeNull();
    // The Back popped the entry; the running close must not go back a second time.
    expect(location.backs).toBe(0);
    expect(location.entries).toEqual([{ navigationId: 2 }]);
    flush();
  }));

  it('closes at once through its handle, without motion, consuming its entry', fakeAsync(() => {
    open();
    animations.length = 0;
    handle.close();
    settle();
    expect(dialog()).toBeNull();
    expect(animations).toEqual([]);
    expect(location.backs).toBe(1);
    flush();
  }));

  it('treats its handle’s close as a no-op once the viewer has closed some other way', fakeAsync(() => {
    open();
    q<HTMLButtonElement>('.viewer__close')!.click();
    settle();
    finishClose();
    expect(dialog()).toBeNull();
    handle.close();
    handle.close();
    settle();
    // One back overall: the ✕'s. A stale handle never goes back again.
    expect(location.backs).toBe(1);
    expect(location.entries).toEqual([{ navigationId: 2 }]);
    flush();
  }));

  it('treats its handle’s close as a no-op after Back closed the viewer', fakeAsync(() => {
    open();
    location.pressBack();
    settle();
    finishClose();
    handle.close();
    settle();
    expect(location.backs).toBe(0);
    expect(location.entries).toEqual([{ navigationId: 2 }]);
    flush();
  }));

  it('lets a handle close a viewer that is already on its way out, going back once', fakeAsync(() => {
    open();
    q<HTMLButtonElement>('.viewer__close')!.click();
    settle();
    handle.close();
    settle();
    expect(dialog()).toBeNull();
    finishClose();
    expect(location.backs).toBe(1);
    flush();
  }));

  it('lets go of the history listener once closed', fakeAsync(() => {
    open();
    expect(location.listeners.length).toBe(1);
    key('Escape');
    finishClose();
    expect(location.listeners.length).toBe(0);
    flush();
  }));
});
