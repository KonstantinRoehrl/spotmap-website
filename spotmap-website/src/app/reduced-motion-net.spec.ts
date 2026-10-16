/** The universal rule inside styles.css's `prefers-reduced-motion` block. */
function reducedMotionNet(): CSSStyleDeclaration {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // a cross-origin sheet cannot be read, and is not ours
    }
    for (const rule of Array.from(rules)) {
      if (
        rule instanceof CSSMediaRule &&
        rule.conditionText.includes('prefers-reduced-motion')
      ) {
        const universal = Array.from(rule.cssRules).find(
          (inner): inner is CSSStyleRule =>
            inner instanceof CSSStyleRule && inner.selectorText.startsWith('*'),
        );
        if (universal) {
          return universal.style;
        }
      }
    }
  }
  throw new Error('styles.css carries no reduced-motion safety net');
}

describe('the reduced-motion safety net', () => {
  it('ends keyframe animations at once, on a still frame', () => {
    const net = reducedMotionNet();
    expect(net.getPropertyValue('animation-duration')).toBe('0.01ms');
    expect(net.getPropertyPriority('animation-duration')).toBe('important');
  });

  it('keeps opacity and colour transitions', () => {
    const kept = reducedMotionNet().getPropertyValue('transition-property');
    for (const property of [
      'opacity',
      'color',
      'background-color',
      'border-color',
    ]) {
      expect(kept).toContain(property);
    }
  });

  it('stops every transition that moves something', () => {
    const kept = reducedMotionNet().getPropertyValue('transition-property');
    for (const property of [
      'all',
      'transform',
      'translate',
      'top',
      'left',
      'width',
      'height',
    ]) {
      expect(kept.split(/,\s*/)).not.toContain(property);
    }
  });

  it('caps the fades at the fade token, 200 ms', () => {
    expect(reducedMotionNet().getPropertyValue('transition-duration')).toBe(
      'var(--dur-fade)',
    );
    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--dur-fade')
        .trim(),
    ).toBe('200ms');
  });
});
