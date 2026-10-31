import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SelectionEvent } from './spot-browser.store';
import { SheetController } from './sheet-controller';

describe('SheetController', () => {
  /** A store the spec drives by hand. */
  function fakeStore(selectedId: string | null = null) {
    return {
      selectedId: signal(selectedId),
      selectionEvent: signal<SelectionEvent | null>(null),
      notice: signal<'not-found' | null>(null),
      close: jasmine.createSpy('close'),
    };
  }

  /** Builds the controller in an injection context and runs its first effects. */
  function create(store: ReturnType<typeof fakeStore>): SheetController {
    const controller = TestBed.runInInjectionContext(
      () => new SheetController(store),
    );
    TestBed.tick();
    return controller;
  }

  /** Raises a change of the open spot and runs the effects. */
  function raise(
    store: ReturnType<typeof fakeStore>,
    kind: SelectionEvent['kind'],
    id: string | null,
  ): void {
    store.selectedId.set(id);
    store.selectionEvent.set({ kind });
    TestBed.tick();
  }

  it('starts at the peek bar with no spot open', () => {
    expect(create(fakeStore()).state()).toBe('peek');
  });

  it('starts on the detail for a cold link', () => {
    expect(create(fakeStore('a')).state()).toBe('detail');
  });

  it('opens to the detail when a spot opens', () => {
    const store = fakeStore();
    const sheet = create(store);
    raise(store, 'opened', 'a');
    expect(sheet.state()).toBe('detail');
  });

  it('stays on the detail when a spot switches', () => {
    const store = fakeStore();
    const sheet = create(store);
    raise(store, 'opened', 'a');
    raise(store, 'switched', 'b');
    expect(sheet.state()).toBe('detail');
  });

  it('returns to its resting height when the spot closes elsewhere', () => {
    const store = fakeStore();
    const sheet = create(store);
    sheet.headTap();
    raise(store, 'opened', 'a');
    raise(store, 'closed', null);
    expect(sheet.state()).toBe('list');
  });

  it('goes to the list on back, and the close that follows does not move it', () => {
    const store = fakeStore('a');
    const sheet = create(store);
    sheet.back();
    expect(store.close).toHaveBeenCalledTimes(1);
    expect(sheet.state()).toBe('list');
    raise(store, 'closed', null);
    expect(sheet.state()).toBe('list');
  });

  it('goes to the peek bar on close and on a map tap, closing the spot', () => {
    const store = fakeStore('a');
    const sheet = create(store);
    sheet.close();
    expect(sheet.state()).toBe('peek');
    raise(store, 'closed', null);
    raise(store, 'opened', 'a');
    sheet.mapTap();
    expect(sheet.state()).toBe('peek');
    expect(store.close).toHaveBeenCalledTimes(2);
  });

  it('ignores a map tap with no spot open', () => {
    const store = fakeStore();
    const sheet = create(store);
    sheet.headTap();
    sheet.mapTap();
    expect(sheet.state()).toBe('list');
    expect(store.close).not.toHaveBeenCalled();
  });

  it('does not ask the store to close with no spot open', () => {
    const store = fakeStore();
    create(store).close();
    expect(store.close).not.toHaveBeenCalled();
  });

  it('forgets a close that never reached the route once a spot opens', () => {
    const store = fakeStore();
    const sheet = create(store);
    sheet.headTap();
    raise(store, 'opened', 'a');
    sheet.back();
    sheet.headTap();
    raise(store, 'opened', 'b');
    raise(store, 'switched', 'c');
    raise(store, 'closed', null);
    expect(sheet.state()).toBe('peek');
  });

  it('opens the list for a spot that does not exist', () => {
    const store = fakeStore();
    const sheet = create(store);
    store.notice.set('not-found');
    TestBed.tick();
    expect(sheet.state()).toBe('list');
  });
});
