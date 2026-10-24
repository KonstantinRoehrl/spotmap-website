import type { Map as MapLibreMap } from 'maplibre-gl';
import { type PointerHold, trackPointerHold } from './pointer-hold';
import { FakeMap } from './testing/fake-map';

describe('trackPointerHold', () => {
  let fake: FakeMap;
  let hold: PointerHold;

  beforeEach(() => {
    fake = new FakeMap();
    hold = trackPointerHold(fake as unknown as MapLibreMap);
  });

  afterEach(() => {
    hold.stop();
    fake.remove();
  });

  /** A pointer event on `target`, bubbling as the real ones do. */
  function pointer(type: string, target: EventTarget, pointerId: number) {
    target.dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true }));
  }

  /** A finger resting on the map after a resize has reset MapLibre's handlers under it. */
  function restFinger() {
    fake.touchDown();
    fake.resize();
  }

  it('is not held before anything touches the map', () => {
    expect(hold.isHeld()).toBe(false);
  });

  it('is held while a pointer is down on the canvas container', () => {
    restFinger();
    expect(hold.isHeld()).toBe(true);
  });

  it('lets go when the pointer comes up', () => {
    restFinger();
    fake.release();
    expect(hold.isHeld()).toBe(false);
  });

  it('lets go when the browser cancels the touch', () => {
    restFinger();
    fake.cancelTouch();
    expect(hold.isHeld()).toBe(false);
  });

  it('lets go when the button comes up off the map', () => {
    restFinger();
    fake.releaseOutsideMap();
    expect(hold.isHeld()).toBe(false);
  });

  it('lets go of every pointer when a context menu opens on the map', () => {
    restFinger();
    fake.canvasContainer.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true }),
    );
    expect(hold.isHeld()).toBe(false);
  });

  it('lets go of every pointer when the window loses focus', () => {
    restFinger();
    window.dispatchEvent(new FocusEvent('blur'));
    expect(hold.isHeld()).toBe(false);
  });

  it('stays held while one of two fingers is still down', () => {
    restFinger();
    pointer('pointerdown', fake.canvasContainer, 8);
    pointer('pointerup', document.body, 8);
    expect(hold.isHeld()).toBe(true);
  });

  it('does not count a pointer that went down on something other than the canvas container', () => {
    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    pointer('pointerdown', elsewhere, 9);
    elsewhere.remove();
    expect(hold.isHeld()).toBe(false);
  });

  it('is held while a gesture handler is active with no pointer down', () => {
    fake.wheel();
    expect(hold.isHeld()).withContext('a wheel zoom under way').toBe(true);
    fake.endWheel();
    expect(hold.isHeld()).toBe(false);
  });

  it('is still held after a resize resets the handlers, until the pointer comes up', () => {
    fake.touchDown();
    fake.resize();
    expect(hold.isHeld())
      .withContext('the handlers reset, the finger did not move')
      .toBe(true);
    fake.release();
    expect(hold.isHeld()).toBe(false);
  });

  it('stops listening and forgets every pointer once stopped', () => {
    restFinger();
    const fromWindow = spyOn(window, 'removeEventListener').and.callThrough();
    const fromContainer = spyOn(
      fake.canvasContainer,
      'removeEventListener',
    ).and.callThrough();
    hold.stop();
    expect(hold.isHeld())
      .withContext('the resting finger is forgotten')
      .toBe(false);
    expect(fromWindow.calls.allArgs().map(([type]) => type)).toEqual(
      jasmine.arrayContaining(['pointerup', 'pointercancel', 'blur']),
    );
    expect(fromContainer.calls.allArgs().map(([type]) => type)).toEqual(
      jasmine.arrayContaining(['pointerdown', 'contextmenu']),
    );
    pointer('pointerdown', fake.canvasContainer, 3);
    expect(hold.isHeld())
      .withContext('a pointer after stop() is not tracked')
      .toBe(false);
  });

  it('removes the window pointer-end listeners with the capture flag they were added with', () => {
    const fromWindow = spyOn(window, 'removeEventListener').and.callThrough();
    hold.stop();
    // The capture flag is part of a listener's identity: removing without it leaves them attached.
    const captured = fromWindow.calls
      .allArgs()
      .filter(([, , capture]) => capture === true)
      .map(([type]) => type);
    expect(captured).toEqual(
      jasmine.arrayContaining(['pointerup', 'pointercancel']),
    );
  });
});
