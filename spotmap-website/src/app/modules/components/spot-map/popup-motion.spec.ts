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

  it('starts the close of a settled popup at full opacity, at rest', async () => {
    const dismissed = dismissPopup(element, false);
    const [from] = keyframesOf(element);
    expect(Number(from?.['opacity'])).toBe(1);
    expect(['none', '0px', '0px 0px'])
      .withContext('at rest, as the close always began')
      .toContain(String(from?.['translate']));
    await dismissed;
  });

  it('starts the close of a popup still rising from where the rise has got to, never from full opacity', async () => {
    revealPopup(pending(), false);
    const reveal = element.getAnimations()[0]!;
    // Held halfway: the popup is part-faded and part-risen, as after a click-through at ~85 ms.
    reveal.pause();
    reveal.currentTime = 85;
    const style = getComputedStyle(element);
    const opacity = Number(style.opacity);
    const translate = style.translate;
    expect(opacity).withContext('mid-reveal').toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);

    const dismissed = dismissPopup(element, false);
    const close = element.getAnimations().at(-1)!;
    expect(close).not.toBe(reveal);
    const [from] = (close.effect as KeyframeEffect).getKeyframes();
    expect(Number(from?.['opacity'])).toBeCloseTo(opacity, 6);
    expect(from?.['translate']).toBe(translate);
    await dismissed;
  });

  it('starts the reduced-motion close of a popup still fading in from its current opacity', async () => {
    revealPopup(pending(), true);
    const reveal = element.getAnimations()[0]!;
    reveal.pause();
    reveal.currentTime = 85;
    const opacity = Number(getComputedStyle(element).opacity);
    expect(opacity).toBeLessThan(1);

    const dismissed = dismissPopup(element, true);
    const close = element.getAnimations().at(-1)!;
    const keyframes = (close.effect as KeyframeEffect).getKeyframes();
    expect(Number(keyframes[0]?.['opacity'])).toBeCloseTo(opacity, 6);
    expect(keyframes.some((keyframe) => 'translate' in keyframe)).toBe(false);
    await dismissed;
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
