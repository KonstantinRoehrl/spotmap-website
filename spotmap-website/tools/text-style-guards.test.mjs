// Static guards over every stylesheet the app ships: a 12px text floor (DESIGN.md Bloom-Budget
// Rule) and text glow drawn only from the text tiers. Static, because a Karma spec only sees a
// component's styles once that component has been created.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const MIN_FONT_PX = 12;
const ROOT_FONT_PX = 16;

/** Sizes below the floor that stay: the MapLibre attribution is a licence line, not site copy. */
const BELOW_FLOOR_ALLOWED = [
  {
    file: 'app/modules/components/spot-map/spot-map.component.css',
    selector: '.maplibregl-ctrl-attrib',
  },
];

/** Every .css / .scss file under `dir`, as paths relative to src/. */
function stylesheets(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return /\.s?css$/.test(entry.name) ? [relative(SRC, path)] : [];
  });
}

/** The innermost `selector { body }` blocks of a stylesheet, comments stripped. */
function rules(file) {
  const source = readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selector: match[1].trim(),
    body: match[2],
  }));
}

/** The values a rule body gives `property`. */
function values(body, property) {
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'g');
  return Array.from(body.matchAll(pattern), (match) => match[1].trim());
}

/** A font-size in px — a clamp() resolves to its minimum — or null when it cannot be resolved. */
function pixels(value) {
  const clamp = value.match(/^clamp\(\s*([^,]+),/);
  if (clamp) return pixels(clamp[1].trim());
  const px = value.match(/^(-?[\d.]+)px$/);
  if (px) return Number(px[1]);
  const rem = value.match(/^(-?[\d.]+)rem$/);
  if (rem) return Number(rem[1]) * ROOT_FONT_PX;
  return null;
}

test('no site-authored font-size is below 12px', () => {
  const tooSmall = [];
  for (const file of stylesheets()) {
    for (const { selector, body } of rules(file)) {
      for (const value of values(body, 'font-size')) {
        const size = pixels(value);
        assert.notEqual(size, null, `${file} ${selector}: cannot resolve "${value}"`);
        const allowed = BELOW_FLOOR_ALLOWED.some(
          (entry) => entry.file === file && selector.includes(entry.selector),
        );
        if (size < MIN_FONT_PX && !allowed) {
          tooSmall.push(`${file} ${selector}: ${value}`);
        }
      }
    }
  }
  assert.deepEqual(tooSmall, []);
});

test('no edge-glow (box-shadow) token feeds a text-shadow', () => {
  const misused = [];
  for (const file of stylesheets()) {
    for (const { selector, body } of rules(file)) {
      for (const value of values(body, 'text-shadow')) {
        if (/--(glow-edge|shadow)-/.test(value)) {
          misused.push(`${file} ${selector}: ${value}`);
        }
      }
    }
  }
  assert.deepEqual(misused, []);
});
