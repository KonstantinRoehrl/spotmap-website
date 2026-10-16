/**
 * Tests for the deploy guard in verify-css-asset-urls.mjs.
 *
 * The guard exists because of a failure that only appears under the deploy prefix: a
 * root-absolute `url()` that a dev server rooted at `/` serves perfectly 404s once the site lives
 * at `/spotmap-website/`, and the page still renders — just without its font. So the fixtures
 * mirror the production output's shape (a hashed stylesheet with the font files emitted beside
 * it) and the tests pin both directions: the deployable spelling passes, and each way of getting
 * it wrong fails.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const STYLESHEET = 'styles-SWSCVZDJ.css';
const FONT = 'fonts/ibm-plex-mono/ibm-plex-mono-latin-400-normal.woff2';

const guard = join(
  dirname(fileURLToPath(import.meta.url)),
  'verify-css-asset-urls.mjs',
);
const workDir = mkdtempSync(join(tmpdir(), 'verify-css-asset-urls-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

test('accepts a stylesheet whose asset paths resolve beside it', () => {
  const result = runGuard(
    buildOutput('deployable', `@font-face{src:url('${FONT}') format('woff2')}`),
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /stylesheet asset paths resolve/);
});

test('rejects a root-absolute asset path, which 404s under the deploy prefix', () => {
  const result = runGuard(
    buildOutput(
      'root-absolute',
      `@font-face{src:url('/${FONT}') format('woff2')}`,
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /root-absolute path/);
  assert.match(result.stderr, /ignores <base href>/);
});

test('rejects a relative path the build never emitted', () => {
  const result = runGuard(
    buildOutput(
      'missing-asset',
      `@font-face{src:url('fonts/ibm-plex-mono/renamed.woff2') format('woff2')}`,
    ),
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /did not emit/);
});

test('leaves alone the references a deploy prefix cannot break', () => {
  const result = runGuard(
    buildOutput(
      'not-file-paths',
      `a{background:url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)}` +
        `b{background:url("https://example.test/x.png")}` +
        `c{background:url(//example.test/y.png)}` +
        `d{filter:url(#glow)}`,
    ),
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\(0 checked\)/);
});

test('checks stylesheets nested below the output root, not just the top level', () => {
  const output = buildOutput(
    'nested',
    `@font-face{src:url('${FONT}') format('woff2')}`,
  );
  mkdirSync(join(output, 'media'), { recursive: true });
  writeFileSync(
    join(output, 'media', 'lazy-chunk.css'),
    `a{background:url('/media/tile.png')}`,
  );

  const result = runGuard(output);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /lazy-chunk\.css/);
});

test('refuses output with no stylesheet at all, rather than passing it', () => {
  const output = join(workDir, 'no-stylesheet');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'index.html'), '<!doctype html>');

  const result = runGuard(output);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /nothing to check/);
});

/** An output directory shaped like the production build: a hashed stylesheet, fonts beside it. */
function buildOutput(name, css) {
  const output = join(workDir, name);
  mkdirSync(join(output, dirname(FONT)), { recursive: true });
  writeFileSync(join(output, STYLESHEET), css);
  writeFileSync(join(output, FONT), 'woff2 bytes');
  return output;
}

function runGuard(output) {
  return spawnSync(process.execPath, [guard, output], { encoding: 'utf8' });
}
