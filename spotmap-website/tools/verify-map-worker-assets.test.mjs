/**
 * Tests for the deploy guard in verify-map-worker-assets.mjs.
 *
 * The guard's only job is to fail the deploy build when the map's worker would 404 in
 * production, so what has to be tested is that it fails there. The fixtures mirror the shape of
 * the real production output: hashed entry scripts listed in index.html, the map chunk pulled in
 * by a lazy `import('./chunk-....js')`, maplibre's runtime worker lookup inside that chunk, and
 * the copied worker asset carrying its own filename in a trailing sourceMappingURL comment.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WORKER = 'maplibre-gl-worker.mjs';
const SHARED = 'maplibre-gl-shared.mjs';
const ENTRY = 'main-G66PJZDB.js';
const MAP_CHUNK = 'chunk-B2Ayl_oN.js';

const guard = join(
  dirname(fileURLToPath(import.meta.url)),
  'verify-map-worker-assets.mjs',
);
const workDir = mkdtempSync(join(tmpdir(), 'verify-map-worker-assets-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

test('accepts output shaped like the real production build', () => {
  const result = runGuard(buildOutput('genuine'));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /maplibre worker assets present/);
});

test('rejects a build whose application chunk stopped naming the worker, even though the copied asset still names itself', () => {
  const result = runGuard(
    buildOutput('renamed-worker-entry', {
      [MAP_CHUNK]: mapChunk('maplibre-gl-renderer-worker.mjs'),
    }),
  );

  assert.equal(
    result.status,
    1,
    `the guard passed a build whose map chunk asks for a worker nothing copied: ${result.stdout}`,
  );
  assert.match(
    result.stderr,
    new RegExp(`no application bundle .* references ${WORKER}`),
  );
});

// `npm run build:pages` builds with `--base-href /spotmap-website/`, so index.html carries that
// base and may address its entry scripts through it.
test('tells application code from copied assets in the deployed /spotmap-website/ layout too', () => {
  const base = '/spotmap-website/';
  const index =
    `<base href="${base}">` +
    `<script src="${base}polyfills-5CFQRCPP.js" type="module"></script>` +
    `<script src="${base}${ENTRY}" type="module"></script>`;

  const genuine = runGuard(
    buildOutput('deployed-layout', { 'index.html': index }),
  );
  const renamed = runGuard(
    buildOutput('deployed-layout-renamed-worker-entry', {
      'index.html': index,
      [MAP_CHUNK]: mapChunk('maplibre-gl-renderer-worker.mjs'),
    }),
  );

  assert.equal(genuine.status, 0, genuine.stderr);
  assert.equal(
    renamed.status,
    1,
    `the guard passed a build whose map chunk asks for a worker nothing copied: ${renamed.stdout}`,
  );
  assert.match(
    renamed.stderr,
    new RegExp(`no application bundle .* references ${WORKER}`),
  );
});

test('rejects a build whose chunk loads a worker that was never copied', () => {
  const result = runGuard(buildOutput('missing-worker', { [WORKER]: null }));

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, new RegExp(`${WORKER} is missing`));
});

test('rejects a build missing the module the worker itself imports', () => {
  const result = runGuard(buildOutput('missing-shared', { [SHARED]: null }));

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, new RegExp(`${SHARED} is missing`));
});

test('rejects output it cannot read the application entry scripts from, rather than passing', () => {
  for (const [name, index] of [
    ['no-index', null],
    ['index-without-scripts', '<html><body>no module scripts</body></html>'],
  ]) {
    const result = runGuard(buildOutput(name, { 'index.html': index }));

    assert.equal(
      result.status,
      1,
      `the guard passed output it could not identify application code in (${name}): ${result.stdout}`,
    );
    assert.match(result.stderr, /index\.html/);
  }
});

function runGuard(outputDir) {
  return spawnSync(process.execPath, [guard, outputDir], { encoding: 'utf8' });
}

/** A browser output directory; an override of `null` leaves that file out of the build. */
function buildOutput(name, overrides = {}) {
  const dir = join(workDir, name);
  mkdirSync(dir, { recursive: true });

  const files = {
    'index.html':
      `<script src="polyfills-5CFQRCPP.js" type="module"></script>` +
      `<script src="${ENTRY}" type="module"></script>`,
    'polyfills-5CFQRCPP.js': 'var t=1;export{t};',
    [ENTRY]:
      `import{a as e}from'./chunk-CXxEgy1j.js';` +
      `let r=()=>import('./${MAP_CHUNK}');export{e,r};`,
    'chunk-CXxEgy1j.js': `import{s}from'./${ENTRY}';export{s as a};`,
    [MAP_CHUNK]: mapChunk(WORKER),
    [WORKER]: `import{p}from"./${SHARED}";p();\n//# sourceMappingURL=${WORKER}.map`,
    [SHARED]: `export function p(){}\n//# sourceMappingURL=${SHARED}.map`,
    ...overrides,
  };

  for (const [file, source] of Object.entries(files)) {
    if (source !== null) writeFileSync(join(dir, file), source);
  }
  return dir;
}

/** The map chunk, carrying maplibre's runtime worker lookup as the production bundle minifies it. */
function mapChunk(workerFilename) {
  return (
    `import{a as o}from'./${ENTRY}';` +
    `function w(t){let e=t.endsWith("-dev.mjs")?"maplibre-gl-worker-dev.mjs":"${workerFilename}";` +
    'return new URL(`./${e}`,t).href}export{w,o};'
  );
}
