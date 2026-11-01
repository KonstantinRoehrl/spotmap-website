import { NgZone } from '@angular/core';
import { attachBodyTouch } from './sheet-body-touch';
import { SheetDrag } from './sheet-drag-session';

describe('attachBodyTouch', () => {
  const zone = { runOutsideAngular: (run: () => void) => run() } as NgZone;
  const stops = { peek: 64, half: 340, full: 784 };
  let body: HTMLElement;
  let pane: HTMLElement;
  let settled: string[];
  let host: HTMLElement;
  let detach: () => void;
  let full: boolean;

  beforeEach(() => {
    host = document.createElement('div');
    host.innerHTML = `<div class="body">
      <div class="pane" style="overflow-y:auto;height:50px">
        <div class="tall" style="height:500px"></div>
      </div>
    </div>`;
    document.body.appendChild(host);
    body = host.querySelector('.body')!;
    pane = host.querySelector('.pane')!;
    settled = [];
    full = false;
    const drag = new SheetDrag(host, () => stops, {
      started: () => undefined,
      settled: (stop) => settled.push(stop),
      release: (clear) => clear(),
    });
    spyOn(host, 'getBoundingClientRect').and.returnValue(
      new DOMRect(0, 0, 100, 340),
    );
    detach = attachBodyTouch(body, drag, () => full, zone);
  });

  afterEach(() => {
    detach();
    host.remove();
  });

  /** Fires a touch event at the pane's content. Returns it, so a spec can see if it was cancelled. */
  function touch(
    type: string,
    points: readonly [number, number][],
    cancelable = true,
  ): Event {
    const event = Object.assign(
      new Event(type, { bubbles: true, cancelable }),
      {
        touches: points.map(([clientX, clientY]) => ({ clientX, clientY })),
      },
    );
    host.querySelector('.tall')!.dispatchEvent(event);
    return event;
  }

  /** The height a drag is holding the sheet at, or an empty string once it lets go. */
  const held = () => host.style.getPropertyValue('--sheet-drag-height');

  it('takes a swipe up below full and cancels the native pan', () => {
    touch('touchstart', [[10, 300]]);
    const first = touch('touchmove', [[10, 280]]);
    expect(first.defaultPrevented).toBeTrue();
    touch('touchmove', [[10, 260]]);
    // Followed from the first move, where the sheet took the touch, so it never jumps.
    expect(held()).toBe('360px');
    touch('touchend', []);
    expect(settled.length).toBe(1);
  });

  it('lets the body scroll a swipe up at full', () => {
    full = true;
    touch('touchstart', [[10, 300]]);
    const first = touch('touchmove', [[10, 280]]);
    expect(first.defaultPrevented).toBeFalse();
    expect(held()).toBe('');
  });

  it('takes a swipe down only with the scroller at its top', () => {
    touch('touchstart', [[10, 100]]);
    touch('touchmove', [[10, 120]]);
    expect(held()).not.toBe('');
    touch('touchend', []);

    pane.scrollTop = 40;
    touch('touchstart', [[10, 100]]);
    const move = touch('touchmove', [[10, 120]]);
    expect(move.defaultPrevented).toBeFalse();
    expect(held()).toBe('');
  });

  it('keeps a scroll a scroll until the finger lifts', () => {
    pane.scrollTop = 40;
    touch('touchstart', [[10, 100]]);
    touch('touchmove', [[10, 120]]);
    pane.scrollTop = 0;
    const later = touch('touchmove', [[10, 160]]);
    expect(later.defaultPrevented).toBeFalse();
    expect(held()).toBe('');
  });

  it('leaves a mostly horizontal move to the rail', () => {
    touch('touchstart', [[10, 100]]);
    const move = touch('touchmove', [[40, 104]]);
    expect(move.defaultPrevented).toBeFalse();
    expect(held()).toBe('');
  });

  it('cannot take a pan the browser already started', () => {
    touch('touchstart', [[10, 300]]);
    touch('touchmove', [[10, 280]], false);
    expect(held()).toBe('');
  });

  it('never takes a second finger, so a pinch stays the page’s', () => {
    touch('touchstart', [
      [10, 300],
      [50, 300],
    ]);
    const move = touch('touchmove', [
      [10, 280],
      [50, 320],
    ]);
    expect(move.defaultPrevented).toBeFalse();
    expect(held()).toBe('');
  });

  it('settles a taken touch when a second finger lands', () => {
    touch('touchstart', [[10, 300]]);
    touch('touchmove', [[10, 280]]);
    touch('touchmove', [
      [10, 270],
      [50, 300],
    ]);
    expect(settled.length).toBe(1);
    expect(held()).toBe('');
  });

  it('settles a taken touch when a second finger touches down', () => {
    touch('touchstart', [[10, 300]]);
    touch('touchmove', [[10, 280]]);
    touch('touchstart', [
      [10, 280],
      [50, 300],
    ]);
    expect(settled.length).toBe(1);
    expect(held()).toBe('');
  });

  it('treats a cancelled touch as a slow release', () => {
    touch('touchstart', [[10, 300]]);
    touch('touchmove', [[10, 280]]);
    touch('touchcancel', []);
    expect(settled).toEqual(['half']);
  });
});
