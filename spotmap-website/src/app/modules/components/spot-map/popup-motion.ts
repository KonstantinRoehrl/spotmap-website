/**
 * The spot popup's open and close motion (B2 Rise), played on MapLibre's popup container with the
 * Web Animations API so nothing waits on a JavaScript timer.
 */

/** The class a popup is created with: laid out and measurable, but not yet shown. */
export const POPUP_PENDING_CLASS = 'spot-popup-frame--pending';

/** B2 Rise: in over 170 ms, rising 6 px to rest. */
const OPEN = {
  durationMs: 170,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  risePx: 6,
};

/** And out over 120 ms, sinking 4 px. */
const CLOSE = { durationMs: 120, easing: 'ease-in', sinkPx: 4 };

/**
 * Shows a pending popup with the open animation. MapLibre rewrites the container's inline
 * `transform` on every map move, so the rise rides on `translate`; reduced motion keeps the fade.
 */
export function revealPopup(
  element: HTMLElement,
  reducedMotion: boolean,
): void {
  element.classList.remove(POPUP_PENDING_CLASS);
  element.animate(
    reducedMotion
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, translate: `0 ${OPEN.risePx}px` },
          { opacity: 1, translate: '0 0' },
        ],
    { duration: OPEN.durationMs, easing: OPEN.easing },
  );
}

/**
 * Plays the close animation and resolves once it has finished — at once for a popup never shown.
 * It begins from wherever the popup is on screen: a popup closed while its 170 ms open is still
 * playing fades on from its in-flight opacity and rise instead of jumping to full opacity first.
 * A cancelled animation (its element removed first) resolves too: the popup is gone either way.
 */
export async function dismissPopup(
  element: HTMLElement,
  reducedMotion: boolean,
): Promise<void> {
  if (element.classList.contains(POPUP_PENDING_CLASS)) {
    return;
  }
  const { opacity, translate } = getComputedStyle(element);
  const animation = element.animate(
    reducedMotion
      ? [{ opacity }, { opacity: 0 }]
      : [
          { opacity, translate },
          { opacity: 0, translate: `0 ${CLOSE.sinkPx}px` },
        ],
    { duration: CLOSE.durationMs, easing: CLOSE.easing, fill: 'forwards' },
  );
  try {
    await animation.finished;
  } catch {
    // Cancelled because the element went first; closing wanted it gone anyway.
  }
}
