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
