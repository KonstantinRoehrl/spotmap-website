import { NgZone } from '@angular/core';
import { prefersReducedMotion } from './prefers-reduced-motion';

/** How a thumb looks: at rest, with the pointer over its bar, or pressed. */
type ThumbLook = 'rest' | 'lit' | 'held';

/** Each look's fill and edge, as tokens or literal colours. The lit fills are the bloom's own greens. */
const THUMB_COLOURS: Record<ThumbLook, { fill: string; edge: string }> = {
  rest: { fill: '--color-phosphor-deep', edge: '--color-phosphor-dim' },
  lit: { fill: 'rgba(0, 255, 0, 0.4)', edge: '--color-phosphor' },
  held: { fill: 'rgba(0, 255, 0, 0.6)', edge: '--color-phosphor-bright' },
};

/**
 * The scroller whose vertical bar is under the pointer, if any. A scrollbar belongs to its element,
 * so the pointer's target is the scroller and no walk up the tree is needed. An inline element
 * reports a client width of 0, and a side border alone leaves no overflow.
 */
export function pointerOnScrollbar(
  target: EventTarget | null,
  clientX: number,
): HTMLElement | null {
  if (
    !(target instanceof HTMLElement) ||
    target.clientWidth === 0 ||
    target.scrollHeight <= target.clientHeight ||
    target.offsetWidth - target.clientWidth - target.clientLeft * 2 <= 0
  ) {
    return null;
  }
  const barStart =
    target.getBoundingClientRect().left +
    target.clientLeft +
    target.clientWidth;
  return clientX >= barStart ? target : null;
}

/**
 * Lights the thumb under the pointer with the buttons' timing, through one delegated listener outside
 * the zone: a hover must cost no change detection. It animates with the Web Animations API, not a
 * CSS transition, since a scroller's own scoped `transition` (`.spot-pane__view`'s) would beat a
 * global rule. Installed only where a pointer can hover. Returns its uninstaller.
 */
export function installScrollbarHover(doc: Document, zone: NgZone): () => void {
  const view = doc.defaultView;
  if (!view?.matchMedia('(hover: hover)').matches) {
    return () => undefined;
  }
  const root = doc.documentElement;
  const rootStyle = view.getComputedStyle(root);
  const resolve = (value: string): string =>
    value.startsWith('--') ? rootStyle.getPropertyValue(value).trim() : value;
  const ms = (token: string): number =>
    parseFloat(rootStyle.getPropertyValue(token));

  const running = new WeakMap<HTMLElement, Animation>();
  let shown: HTMLElement | null = null;
  let look: ThumbLook = 'rest';

  /** Fades `scroller` from whatever it shows now to `next`. */
  const fade = (scroller: HTMLElement, next: ThumbLook): void => {
    const style = view.getComputedStyle(scroller);
    const fill = style.getPropertyValue('--scrollbar-thumb-fill');
    const edge = style.getPropertyValue('--scrollbar-thumb-edge');
    running.get(scroller)?.cancel();
    const animation = scroller.animate(
      {
        '--scrollbar-thumb-fill': [fill, resolve(THUMB_COLOURS[next].fill)],
        '--scrollbar-thumb-edge': [edge, resolve(THUMB_COLOURS[next].edge)],
      },
      {
        duration: prefersReducedMotion()
          ? ms('--dur-fade')
          : ms(next === 'rest' ? '--dur-hover-out' : '--dur-hover-in'),
        easing: 'ease-out',
        fill: 'forwards',
      },
    );
    running.set(scroller, animation);
    if (next === 'rest') {
      // Back at rest the fill has nothing to hold, and the scroller keeps no animation.
      animation.finished.then(
        () => animation.cancel(),
        () => undefined,
      );
    }
  };

  /** Moves the lit look to `scroller`, or nowhere, and lets go of whichever had it. */
  const show = (scroller: HTMLElement | null, next: ThumbLook): void => {
    if (scroller === shown && next === look) {
      return;
    }
    if (shown && shown !== scroller && look !== 'rest') {
      fade(shown, 'rest');
    }
    if (scroller) {
      fade(scroller, next);
    }
    shown = scroller;
    look = next;
  };

  const onMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      return;
    }
    if (look === 'held' && event.buttons & 1) {
      return;
    }
    const scroller = pointerOnScrollbar(event.target, event.clientX);
    show(scroller, scroller ? 'lit' : 'rest');
  };

  const onDown = (event: PointerEvent): void => {
    const scroller =
      event.pointerType === 'touch'
        ? null
        : pointerOnScrollbar(event.target, event.clientX);
    if (scroller) {
      show(scroller, 'held');
    }
  };

  const onUp = (event: PointerEvent): void => {
    if (look === 'held') {
      const scroller = pointerOnScrollbar(event.target, event.clientX);
      show(scroller ?? shown, scroller ? 'lit' : 'rest');
    }
  };

  const onLeave = (): void => show(null, 'rest');

  zone.runOutsideAngular(() => {
    doc.addEventListener('pointermove', onMove, { passive: true });
    doc.addEventListener('pointerdown', onDown, { passive: true });
    doc.addEventListener('pointerup', onUp, { passive: true });
    root.addEventListener('pointerleave', onLeave, { passive: true });
  });

  return () => {
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerdown', onDown);
    doc.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointerleave', onLeave);
  };
}
