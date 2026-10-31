import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import {
  COLUMN_SHARE_STORAGE_KEY,
  columnWidthFor,
  DEFAULT_COLUMN_WIDTH_PX,
} from '../../components/split-handle/column-split';
import { COLUMN_RESET_EASE_MS, ColumnSplitState } from './column-split-state';

const FRAME_PX = 1200;

describe('ColumnSplitState', () => {
  beforeEach(() => localStorage.removeItem(COLUMN_SHARE_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(COLUMN_SHARE_STORAGE_KEY));

  /** A state over a settable frame width, in an injector the spec can destroy. */
  function create(frameWidth = signal(FRAME_PX)) {
    const injector = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector),
    );
    const column = runInInjectionContext(
      injector,
      () => new ColumnSplitState(frameWidth),
    );
    return { column, frameWidth, injector };
  }

  it('starts at the default width with nothing remembered', () => {
    expect(create().column.width()).toBe(DEFAULT_COLUMN_WIDTH_PX);
  });

  it('starts from a remembered share', () => {
    localStorage.setItem(COLUMN_SHARE_STORAGE_KEY, '0.4');
    expect(create().column.width()).toBe(columnWidthFor(0.4, FRAME_PX));
  });

  it('keeps the proportion when the window resizes', () => {
    const { column, frameWidth } = create();
    column.resize(480);
    frameWidth.set(1000);
    expect(column.width()).toBe(columnWidthFor(0.4, 1000));
  });

  it('caps the share at half the window', () => {
    const { column } = create();
    column.resize(FRAME_PX);
    column.persist();
    expect(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)).toBe('0.5');
  });

  it('ignores a move while the window is unmeasured', () => {
    const { column } = create(signal(0));
    column.resize(480);
    column.persist();
    expect(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)).toBeNull();
  });

  it('writes the share only when the handle finishes moving', () => {
    const { column } = create();
    column.resize(480);
    expect(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)).toBeNull();
    column.persist();
    expect(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)).toBe('0.4');
  });

  it('persists nothing while at the default width', () => {
    create().column.persist();
    expect(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)).toBeNull();
  });

  it('forgets the share and eases back to the default on reset', fakeAsync(() => {
    const { column } = create();
    column.resize(480);
    column.persist();
    column.reset();
    expect(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)).toBeNull();
    expect(column.width()).toBe(DEFAULT_COLUMN_WIDTH_PX);
    expect(column.easing()).toBeTrue();
    tick(COLUMN_RESET_EASE_MS + 50);
    expect(column.easing()).toBeFalse();
  }));

  it('resets at once under reduced motion', () => {
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
        }) as MediaQueryList,
    );
    const { column } = create();
    column.reset();
    expect(column.easing()).toBeFalse();
    expect(column.width()).toBe(DEFAULT_COLUMN_WIDTH_PX);
  });

  it('clears the ease’s timer when destroyed', fakeAsync(() => {
    const { column, injector } = create();
    column.reset();
    injector.destroy();
    // fakeAsync fails the test on a timer still queued here.
  }));
});
