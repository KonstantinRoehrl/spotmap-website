/** The custom property `name` as the root element resolves it. */
function token(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/** What the browser paints for `value` of `property`, so assertions compare rendered output. */
function painted(property: 'text-shadow' | 'color', value: string): string {
  const probe = document.createElement('span');
  probe.style.setProperty(property, value);
  document.body.appendChild(probe);
  const result = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return result;
}

/** Every blur radius, in px, of a computed `text-shadow` list. */
function blurRadii(shadow: string): number[] {
  return Array.from(
    shadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g),
    (match) => Number(match[3]),
  );
}

/** The sRGB bytes the browser paints for `layers`, drawn bottom first onto one pixel. */
function pixel(...layers: string[]): [number, number, number] {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d')!;
  for (const layer of layers) {
    context.fillStyle = layer;
    context.fillRect(0, 0, 1, 1);
  }
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** WCAG relative luminance of sRGB bytes. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((byte) => {
    const channel = byte / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two painted colours. */
function contrast(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The bloom's peak: 40 % phosphor green over the ground it sits on. */
const BLOOM_PEAK = 'rgba(0, 255, 0, 0.4)';

/** Every style rule of the loaded stylesheets, descending into `@media` blocks. */
function styleRules(
  rules: CSSRuleList = Array.from(document.styleSheets)
    .map((sheet) => Array.from(sheet.cssRules))
    .flat() as unknown as CSSRuleList,
): CSSStyleRule[] {
  return Array.from(rules).flatMap((rule) =>
    rule instanceof CSSStyleRule
      ? [rule]
      : 'cssRules' in rule
        ? styleRules((rule as CSSGroupingRule).cssRules)
        : [],
  );
}

/** A selector's specificity as [ids, classes/attributes/pseudo-classes, types]. */
type Specificity = [number, number, number];

/** The comma-separated parts of `list` that sit outside any parentheses. */
function topLevelParts(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts;
}

/**
 * The specificity of one complex selector (no top-level comma). `:is()`, `:not()` and `:has()`
 * count as their most specific argument, `:where()` as nothing, as the Selectors spec defines;
 * ids, classes, attributes and other pseudo-classes, and element types, count in their columns.
 */
function specificity(selector: string): Specificity {
  const total: Specificity = [0, 0, 0];
  let rest = selector;
  const functional = /:(is|not|has|where)\(/;
  for (
    let match = functional.exec(rest);
    match;
    match = functional.exec(rest)
  ) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (depth > 0) {
      depth += rest[end] === '(' ? 1 : rest[end] === ')' ? -1 : 0;
      end++;
    }
    if (match[1] !== 'where') {
      const inner = rest.slice(match.index + match[0].length, end - 1);
      const [a, b, c] = topLevelParts(inner)
        .map(specificity)
        .reduce((best, next) => (compare(next, best) > 0 ? next : best));
      total[0] += a;
      total[1] += b;
      total[2] += c;
    }
    rest = rest.slice(0, match.index) + rest.slice(end);
  }
  total[0] += (rest.match(/#[\w-]+/g) ?? []).length;
  total[1] += (rest.match(/\.[\w-]+|\[[^\]]*\]|(?<!:):[\w-]+/g) ?? []).length;
  total[2] += (rest.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return total;
}

/** Positive when `a` outranks `b`, negative when `b` outranks `a`, zero on a tie. */
function compare(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

describe('text glow tiers', () => {
  for (const name of [
    '--glow-text-display',
    '--glow-text-standard',
    '--glow-text-amber',
  ]) {
    it(`keeps every halo of ${name} at 6px or tighter`, () => {
      const radii = blurRadii(painted('text-shadow', `var(${name})`));
      expect(radii.length).toBeGreaterThan(0);
      expect(Math.max(...radii)).toBeLessThanOrEqual(6);
    });
  }

  it('retires the blanket-era tokens', () => {
    for (const name of [
      '--glow-text-rest',
      '--glow-text-hot',
      '--dur-glow-fade',
      '--glow-edge-active',
      '--shadow-edge-active',
    ]) {
      expect(token(name)).withContext(name).toBe('');
    }
  });

  it('leaves plain text unlit', () => {
    for (const tag of ['div', 'span', 'pre', 'a', 'p']) {
      const element = document.createElement(tag);
      element.textContent = 'text';
      document.body.appendChild(element);
      expect(getComputedStyle(element).textShadow)
        .withContext(tag)
        .toBe('none');
      element.remove();
    }
  });

  it('keeps the mono face on the elements the blanket rule covered', () => {
    const pre = document.createElement('pre');
    document.body.appendChild(pre);
    expect(getComputedStyle(pre).fontFamily).toContain('IBM Plex Mono');
    pre.remove();
  });

  it('rests a pointer-bloom control in the Standard tier', () => {
    const button = document.createElement('button');
    button.className = 'phosphor-bloom';
    button.textContent = 'RETRY';
    document.body.appendChild(button);
    expect(getComputedStyle(button).textShadow).toBe(
      painted('text-shadow', 'var(--glow-text-standard)'),
    );
    expect(getComputedStyle(button).color).toBe(
      painted('color', 'var(--color-phosphor)'),
    );
    button.remove();
  });

  it('times the bloom in quick and out slow', () => {
    expect(token('--dur-hover-in')).toBe('120ms');
    expect(token('--dur-hover-out')).toBe('700ms');
  });

  describe('contrast (WCAG AA body text, 4.5:1)', () => {
    const grounds: Record<string, string> = {
      black: 'var(--color-bg)',
      surface: 'var(--color-surface)',
    };

    for (const [groundName, ground] of Object.entries(grounds)) {
      for (const ink of [
        '--color-phosphor-bright',
        '--color-phosphor',
        '--color-phosphor-dim',
      ]) {
        it(`${ink} on ${groundName}`, () => {
          const back = pixel(token(ground.slice(4, -1)));
          expect(contrast(pixel(token(ink)), back)).toBeGreaterThanOrEqual(4.5);
        });
      }

      it(`the lit label over the bloom's peak on ${groundName}`, () => {
        const back = pixel(token(ground.slice(4, -1)), BLOOM_PEAK);
        expect(
          contrast(pixel(token('--color-phosphor-bright')), back),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  // :hover cannot be simulated in Karma, so the hover rule's exclusions are read off the
  // stylesheet itself (the lit look's selector lists are the subject here).
  describe('the bloom stylesheet rules', () => {
    const litRules = (needle: string) =>
      styleRules().filter(
        (rule) =>
          rule.selectorText.includes('.phosphor-bloom') &&
          rule.selectorText.includes(needle) &&
          rule.style.getPropertyValue('box-shadow') !== '',
      );

    it('does not light a disabled Material option on hover', () => {
      const rules = litRules(':hover');
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.selectorText).toContain('mdc-list-item--disabled');
      }
    });

    // The rule behind the city label's grey-green hover: Material (the version in package.json)
    // paints the hovered outlined field's label with this selector, injecting its stylesheet after
    // styles.css, so a tie in specificity is lost to it.
    const MATERIAL_HOVERED_LABEL =
      '.mdc-text-field--outlined:not(.mdc-text-field--disabled):not(.mdc-text-field--focused):hover .mdc-floating-label';

    it('outranks the colour Material gives the hovered field label', () => {
      const rules = styleRules().filter(
        (rule) =>
          rule.selectorText.includes('.phosphor-bloom:hover') &&
          rule.selectorText.includes('.mdc-floating-label') &&
          rule.style.getPropertyValue('color') !== '',
      );
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(
          compare(
            specificity(rule.selectorText),
            specificity(MATERIAL_HOVERED_LABEL),
          ),
        )
          .withContext(rule.selectorText)
          .toBeGreaterThan(0);
      }
    });

    it('keeps the label float animation on the label alone', () => {
      const transitions = (needle: string) =>
        styleRules().filter(
          (rule) =>
            rule.selectorText.includes(needle) &&
            rule.style.getPropertyValue('transition-property') !== '',
        );
      const [labelRule] = transitions('.mdc-floating-label');
      const valueRules = transitions('.mat-mdc-select-value');
      expect(labelRule.style.getPropertyValue('transition-property')).toContain(
        'transform',
      );
      expect(valueRules.length).toBeGreaterThan(0);
      for (const rule of valueRules) {
        expect(rule.style.getPropertyValue('transition-property'))
          .withContext(rule.selectorText)
          .not.toContain('transform');
      }
    });

    it('lets a hovered option take the light from the keyboard-active one', () => {
      const rules = litRules('mat-mdc-option-active');
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.selectorText).toMatch(
          /mat-mdc-select-panel:has\(\.mat-mdc-option:hover\)/,
        );
      }
    });
  });
});
