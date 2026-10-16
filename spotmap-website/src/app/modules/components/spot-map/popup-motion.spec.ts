import { dismissPopup, POPUP_PENDING_CLASS, revealPopup } from './popup-motion';

/** Every keyframe of the element's first animation, as the browser resolved them. */
function keyframesOf(element: HTMLElement): ComputedKeyframe[] {
  const effect = element.getAnimations()[0]?.effect;
  return effect instanceof KeyframeEffect ? effect.getKeyframes() : [];
}

describe('popup motion', () => {
  let element: HTMLElement;

  beforeEach(() => {
    // Real Web Animations, so the element lives in the document like a popup container does.
    element = document.createElement('div');
    document.body.append(element);
  });

  afterEach(() => {
    element.remove();
  });

  /** A container as the map creates it: laid out, but not yet shown. */
  function pending(): HTMLElement {
    element.classList.add(POPUP_PENDING_CLASS);
    return element;
  }

  it('reveals a pending popup with a 6 px rise', () => {
    revealPopup(pending(), false);
    expect(element.classList).not.toContain(POPUP_PENDING_CLASS);
    const [from] = keyframesOf(element);
    expect(from?.computedOffset).toBe(0);
    expect(from?.['translate']).toBe('0px 6px');
    expect(element.getAnimations()[0]?.effect?.getTiming().duration).toBe(170);
  });

  it('reveals with a fade only under reduced motion', () => {
    revealPopup(pending(), true);
    const keyframes = keyframesOf(element);
    expect(keyframes.length).toBeGreaterThan(0);
    expect(keyframes.some((keyframe) => 'translate' in keyframe)).toBe(false);
    expect(keyframes.map((keyframe) => keyframe['opacity'])).toEqual([
      '0',
      '1',
    ]);
  });

  it('dismisses after its 120 ms animation', async () => {
    const dismissed = dismissPopup(element, false);
    const animation = element.getAnimations()[0];
    expect(animation?.effect?.getTiming().duration).toBe(120);
    await dismissed;
    expect(animation?.playState).toBe('finished');
  });

  it('dismisses a popup that never showed at once', async () => {
    await dismissPopup(pending(), false);
    expect(element.getAnimations().length).toBe(0);
  });

  it('resolves when the element is removed mid-animation', async () => {
    const dismissed = dismissPopup(element, false);
    const animation = element.getAnimations()[0];
    expect(animation).withContext('the close animation started').toBeDefined();
    animation?.cancel();
    await expectAsync(dismissed).toBeResolved();
  });
});
