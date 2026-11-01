/** Every rule in the document's readable sheets, media and supports blocks flattened with their condition. */
function allRules(): { rule: CSSRule; conditions: string[] }[] {
  const found: { rule: CSSRule; conditions: string[] }[] = [];
  const walk = (rules: CSSRuleList, conditions: string[]) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSConditionRule) {
        walk(rule.cssRules, [...conditions, rule.conditionText]);
      } else {
        found.push({ rule, conditions });
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, []);
    } catch {
      continue; // a cross-origin sheet cannot be read, and is not ours
    }
  }
  return found;
}

/** The style rule whose selector is `selector`, with the conditions it sits under. */
function ruleFor(selector: string) {
  const match = allRules().find(
    ({ rule }) =>
      rule instanceof CSSStyleRule && rule.selectorText === selector,
  );
  if (!match) {
    throw new Error(`styles.css has no rule for ${selector}`);
  }
  return {
    style: (match.rule as CSSStyleRule).style,
    conditions: match.conditions,
  };
}

describe('the themed scrollbar', () => {
  it('declares the dark colour scheme at the root', () => {
    expect(getComputedStyle(document.documentElement).colorScheme).toBe('dark');
  });

  it('applies the styled parts only where a fine pointer can hover', () => {
    for (const part of [
      '::-webkit-scrollbar',
      '::-webkit-scrollbar-track',
      '::-webkit-scrollbar-thumb',
    ]) {
      expect(ruleFor(part).conditions.join(' '))
        .withContext(part)
        .toContain('(hover: hover) and (pointer: fine)');
    }
  });

  it('sizes the bar 12 px, on a raised track with a line rule, under a 4 px thumb reading the registered colours', () => {
    expect(ruleFor('::-webkit-scrollbar').style.width).toBe('12px');
    const track = ruleFor('::-webkit-scrollbar-track').style;
    expect(track.background).toContain('--color-surface-raised');
    expect(track.borderLeft).toContain('--color-line');
    const thumb = ruleFor('::-webkit-scrollbar-thumb').style;
    expect(thumb.background).toContain('--scrollbar-thumb-fill');
    expect(thumb.border).toContain('--scrollbar-thumb-edge');
    expect(thumb.borderRadius).toContain('--radius-sm');
  });

  it('keeps the standard scrollbar properties away from browsers with the styled parts', () => {
    const conditions = ruleFor('*').conditions.join(' ');
    expect(conditions).toContain('not selector(::-webkit-scrollbar)');
  });

  it('reserves the bar’s gutter on the pane views and the picker panel', () => {
    const gutter = ruleFor('.spot-pane__view, .mat-mdc-select-panel');
    expect(gutter.style.getPropertyValue('scrollbar-gutter')).toBe('stable');
    expect(gutter.conditions.join(' ')).toContain('(hover: hover)');
  });
});

describe('the spacing tokens', () => {
  const token = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  it('names the roles on the root', () => {
    expect(token('--space-inset')).toBe('16px');
    expect(token('--space-group')).toBe('16px');
    expect(token('--space-item')).toBe('8px');
    expect(token('--target-min')).toBe('44px');
    expect(token('--space-gutter')).toBe(
      window.matchMedia('(min-width: 1024px)').matches ? '24px' : '16px',
    );
  });
});
