import { NgZone } from '@angular/core';
import { installScrollbarHover, pointerOnScrollbar } from './scrollbar-hover';

describe('scrollbar hover', () => {
  /** A scroller with a 12 px bar: 100 px wide, 88 px of it content, overflowing, at the page's left. */
  function scroller(): HTMLElement {
    const element = document.createElement('div');
    for (const [name, value] of Object.entries({
      offsetWidth: 100,
      clientWidth: 88,
      clientLeft: 0,
      clientHeight: 100,
      scrollHeight: 500,
    })) {
      Object.defineProperty(element, name, { value });
    }
    spyOn(element, 'getBoundingClientRect').and.returnValue(
      new DOMRect(0, 0, 100, 100),
    );
    document.body.appendChild(element);
    return element;
  }

  const zone = { runOutsideAngular: (run: () => void) => run() } as NgZone;
  let uninstall: () => void;
  let elements: HTMLElement[];

  /** A scroller the spec cleans up. */
  function tracked(): HTMLElement {
    const element = scroller();
    elements.push(element);
    return element;
  }

  beforeEach(() => {
    elements = [];
    uninstall = () => undefined;
  });

  afterEach(() => {
    uninstall();
    elements.forEach((element) => element.remove());
  });

  /** Answers every media query through `matches`. */
  function stubMedia(matches: (query: string) => boolean): void {
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: matches(query),
          media: query,
        }) as unknown as MediaQueryList,
    );
  }

  /** Fires `type` at `target`, as a mouse would. */
  function fire(
    target: Element,
    type: string,
    init: PointerEventInit = {},
  ): void {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerType: 'mouse',
        ...init,
      }),
    );
  }

  /** The duration of the last animation started on `element`. */
  const lastDuration = (element: HTMLElement): number =>
    (
      (element.animate as jasmine.Spy).calls.mostRecent()
        .args[1] as KeyframeAnimationOptions
    ).duration as number;

  it('finds the scroller only over its bar', () => {
    const element = tracked();
    expect(pointerOnScrollbar(element, 90)).toBe(element);
    expect(pointerOnScrollbar(element, 50)).toBeNull();
  });

  it('ignores an element that shows no bar, and an inline one', () => {
    const plain = document.createElement('div');
    expect(pointerOnScrollbar(plain, 0)).toBeNull();
    const inline = document.createElement('span');
    Object.defineProperty(inline, 'offsetWidth', { value: 40 });
    expect(pointerOnScrollbar(inline, 0)).toBeNull();
  });

  it('lights over 120 ms and decays over 700 ms, like the buttons', () => {
    stubMedia((query) => query === '(hover: hover)');
    const element = tracked();
    spyOn(element, 'animate').and.callThrough();
    uninstall = installScrollbarHover(document, zone);
    fire(element, 'pointermove', { clientX: 90 });
    expect(lastDuration(element)).toBe(120);
    fire(element, 'pointermove', { clientX: 50 });
    expect(lastDuration(element)).toBe(700);
  });

  it('stays held while the button is down, even off the bar', () => {
    stubMedia((query) => query === '(hover: hover)');
    const element = tracked();
    spyOn(element, 'animate').and.callThrough();
    uninstall = installScrollbarHover(document, zone);
    fire(element, 'pointerdown', { clientX: 90, buttons: 1 });
    const calls = (element.animate as jasmine.Spy).calls.count();
    fire(element, 'pointermove', { clientX: 50, buttons: 1 });
    expect((element.animate as jasmine.Spy).calls.count()).toBe(calls);
    fire(element, 'pointerup', { clientX: 50 });
    expect(lastDuration(element)).toBe(700);
  });

  it('ignores touch', () => {
    stubMedia((query) => query === '(hover: hover)');
    const element = tracked();
    spyOn(element, 'animate').and.callThrough();
    uninstall = installScrollbarHover(document, zone);
    fire(element, 'pointermove', { clientX: 90, pointerType: 'touch' });
    expect(element.animate).not.toHaveBeenCalled();
  });

  it('installs nothing on a device that cannot hover', () => {
    stubMedia(() => false);
    const element = tracked();
    spyOn(element, 'animate').and.callThrough();
    uninstall = installScrollbarHover(document, zone);
    fire(element, 'pointermove', { clientX: 90 });
    expect(element.animate).not.toHaveBeenCalled();
  });

  it('stops listening once uninstalled', () => {
    stubMedia((query) => query === '(hover: hover)');
    const element = tracked();
    spyOn(element, 'animate').and.callThrough();
    installScrollbarHover(document, zone)();
    fire(element, 'pointermove', { clientX: 90 });
    expect(element.animate).not.toHaveBeenCalled();
  });

  it('fades at the one kept length under reduced motion', () => {
    stubMedia(() => true);
    const element = tracked();
    spyOn(element, 'animate').and.callThrough();
    uninstall = installScrollbarHover(document, zone);
    fire(element, 'pointermove', { clientX: 90 });
    expect(lastDuration(element)).toBe(200);
  });
});
