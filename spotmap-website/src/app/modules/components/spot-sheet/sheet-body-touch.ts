import { NgZone } from '@angular/core';
import { BodyTouchOwner, decideBodyTouch, findScroller } from './sheet-drag';
import { SheetDrag } from './sheet-drag-session';

/**
 * Drags the sheet from a touch in its body. Who owns the touch is decided once, on its first move,
 * since a pan the browser has started can't be taken over: a swipe that begins as a scroll stays one
 * until the finger lifts, and a swipe up that reaches full does not start scrolling either. Multi-touch
 * is never the sheet's. `touchmove` is non-passive so a taken touch can cancel the pan. Runs outside the
 * zone. Returns its detacher.
 */
export function attachBodyTouch(
  body: HTMLElement,
  drag: SheetDrag,
  isFull: () => boolean,
  zone: NgZone,
): () => void {
  let owner: BodyTouchOwner = 'none';
  let start = { x: 0, y: 0 };
  let scroller: Element | null = null;

  /** Gives the touch up once a second finger arrives, settling the drag first if the sheet had taken it. */
  const giveUpToMultiTouch = (event: TouchEvent): void => {
    if (owner === 'sheet') {
      drag.end(event.timeStamp, true);
    }
    owner = 'none';
  };

  const onStart = (event: TouchEvent): void => {
    if (event.touches.length !== 1) {
      giveUpToMultiTouch(event);
      return;
    }
    owner = 'undecided';
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    scroller = findScroller(event.target as Element, body);
  };

  const onMove = (event: TouchEvent): void => {
    if (event.touches.length !== 1) {
      giveUpToMultiTouch(event);
      return;
    }
    const { clientX, clientY } = event.touches[0];
    if (owner === 'undecided') {
      owner = event.cancelable
        ? decideBodyTouch({
            dx: clientX - start.x,
            dy: clientY - start.y,
            full: isFull(),
            atTop: !scroller || scroller.scrollTop <= 0,
          })
        : 'scroll';
      if (owner === 'sheet') {
        drag.begin(clientY);
      }
    }
    if (owner === 'sheet') {
      event.preventDefault();
      drag.move(clientY, event.timeStamp);
    }
  };

  const onEnd = (event: TouchEvent): void => {
    if (event.touches.length > 0) {
      return;
    }
    if (owner === 'sheet') {
      drag.end(event.timeStamp, event.type === 'touchcancel');
    }
    owner = 'none';
  };

  zone.runOutsideAngular(() => {
    body.addEventListener('touchstart', onStart, { passive: true });
    body.addEventListener('touchmove', onMove, { passive: false });
    body.addEventListener('touchend', onEnd, { passive: true });
    body.addEventListener('touchcancel', onEnd, { passive: true });
  });

  return () => {
    body.removeEventListener('touchstart', onStart);
    body.removeEventListener('touchmove', onMove);
    body.removeEventListener('touchend', onEnd);
    body.removeEventListener('touchcancel', onEnd);
  };
}
