/**
 * Tests for the deploy guard in verify-initial-bundle.mjs.
 *
 * The guard exists because a stray static import of an admin library still builds and still
 * works — it only makes every visitor download the maintainer tool. So the fixtures mirror the
 * production output's shape (hashed entry scripts in index.html, a shared chunk the entry imports
 * statically, the admin route reached through a lazy `import()`, the admin libraries in a chunk
 * that route imports) and the tests pin both directions: lazy libraries pass, and each way a
 * library can reach the initial bundle, or slip out of sight of the check, fails.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ADMIN_LIBRARY_MARKERS,
  entryScripts,
  findViolations,
  initialFiles,
  javascriptFiles,
  staticImports,
} from './verify-initial-bundle.mjs';

const POLYFILLS = 'polyfills-5CFQRCPP.js';
const ENTRY = 'main-3PV3CN3T.js';
const SHARED_CHUNK = 'chunk-CXxEgy1j.js';
const ADMIN_CHUNK = 'chunk-AdM1nRt3.js';
const LIBRARY_CHUNK = 'chunk-L1bsK7qz.js';
const SUPABASE = ADMIN_LIBRARY_MARKERS.find(
  ({ library }) => library === '@supabase/supabase-js',
);
const WEBP = ADMIN_LIBRARY_MARKERS.find(
  ({ library }) => library === '@jsquash/webp',
);

const guard = join(
  dirname(fileURLToPath(import.meta.url)),
  'verify-initial-bundle.mjs',
);
const workDir = mkdtempSync(join(tmpdir(), 'verify-initial-bundle-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

test('entryScripts lists the scripts, then the module preloads, relative to the output root', () => {
  assert.deepEqual(
    entryScripts(
      `<script src="${POLYFILLS}" type="module"></script>` +
        `<link rel="modulepreload" href="${SHARED_CHUNK}">` +
        `<script src="${ENTRY}" type="module"></script>`,
    ),
    [POLYFILLS, ENTRY, SHARED_CHUNK],
  );
});

test('entryScripts reads paths under <base href> from the output root and skips other origins', () => {
  assert.deepEqual(
    entryScripts(
      '<base href="/spotmap-website/">' +
        `<script src="/spotmap-website/${POLYFILLS}" type="module"></script>` +
        `<script src="${ENTRY}?v=1" type="module"></script>` +
        `<link href="/spotmap-website/${SHARED_CHUNK}" rel="modulepreload">` +
        '<script src="https://cdn.example.test/analytics.js"></script>' +
        '<script src="//cdn.example.test/other.js"></script>' +
        `<script src="${ENTRY}" type="module"></script>`,
    ),
    [POLYFILLS, ENTRY, SHARED_CHUNK],
  );
});

test('staticImports finds every static edge the minifier writes and no dynamic one', () => {
  assert.deepEqual(
    staticImports(
      `import{a as e}from"./${SHARED_CHUNK}";` +
        `import'./side-effect.js';` +
        `export*from"../up.js";` +
        `import {b} from './${SHARED_CHUNK}';` +
        `import{c}from"@angular/core";` +
        `let r=()=>import("./${ADMIN_CHUNK}"),t=()=>import(\`./lazy-template.js\`);` +
        `const u=import.meta.url;`,
    ),
    [`./${SHARED_CHUNK}`, './side-effect.js', '../up.js'],
  );
});

test('initialFiles walks static imports from the entries, stops at dynamic ones and skips missing files', () => {
  const output = buildOutput('walk', {
    [SHARED_CHUNK]: `import{s}from"./${ENTRY}";import"./not-emitted.js";export{s as a};`,
  });

  assert.deepEqual(initialFiles(output, [POLYFILLS, ENTRY]), [
    POLYFILLS,
    ENTRY,
    SHARED_CHUNK,
  ]);
});

test('javascriptFiles lists every emitted module below the output root, nested ones too', () => {
  const output = buildOutput('listing');
  mkdirSync(join(output, 'media'), { recursive: true });
  writeFileSync(join(output, 'media', 'maplibre-gl-worker.mjs'), 'export{};');
  writeFileSync(join(output, `${ENTRY}.map`), '{}');
  writeFileSync(join(output, 'styles-3AXONVKY.css'), 'a{}');

  assert.deepEqual(javascriptFiles(output), [
    ADMIN_CHUNK,
    SHARED_CHUNK,
    LIBRARY_CHUNK,
    ENTRY,
    'media/maplibre-gl-worker.mjs',
    POLYFILLS,
  ]);
});

test('findViolations reports a marker in an initial file and a marker no lazy file carries', () => {
  const markers = [
    { library: 'lib-a', marker: 'marker of a' },
    { library: 'lib-b', marker: 'marker of b' },
    { library: 'lib-c', marker: 'marker of c' },
  ];
  const sources = new Map([
    [ENTRY, 'throw new Error("marker of a")'],
    [ADMIN_CHUNK, 'throw new Error("marker of a");throw "marker of c"'],
  ]);

  assert.deepEqual(findViolations(sources, new Set([ENTRY]), markers), [
    { kind: 'initial', library: 'lib-a', marker: 'marker of a', file: ENTRY },
    { kind: 'absent', library: 'lib-b', marker: 'marker of b' },
  ]);
});

test('findViolations reports nothing when every marker sits only in lazy files', () => {
  const sources = new Map([
    [ENTRY, 'export{}'],
    [LIBRARY_CHUNK, libraryChunk()],
  ]);

  assert.deepEqual(
    findViolations(sources, new Set([ENTRY]), ADMIN_LIBRARY_MARKERS),
    [],
  );
});

test('accepts output shaped like the real production build', () => {
  const result = runGuard(buildOutput('genuine'));

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /admin libraries stay out of the initial bundle .*\(3 initial files, 5 libraries checked\)/,
  );
});

test('rejects admin libraries a static import pulls into the initial bundle', () => {
  const result = runGuard(
    buildOutput('static-admin-import', {
      [ENTRY]:
        `import{a as e}from"./${SHARED_CHUNK}";import"./${LIBRARY_CHUNK}";` +
        `let r=()=>import(\`./${ADMIN_CHUNK}\`);export{e,r};`,
    }),
  );

  assert.equal(
    result.status,
    1,
    `the guard passed a build whose entry imports the admin libraries statically: ${result.stdout}`,
  );
  for (const { library } of ADMIN_LIBRARY_MARKERS) {
    assert.match(
      result.stderr,
      new RegExp(
        `chunk-L1bsK7qz\\.js is part of the initial bundle and carries ${library}`,
      ),
    );
  }
});

test('names only the library that leaked, however many hops from index.html', () => {
  const result = runGuard(
    buildOutput('leak-two-hops', {
      [SHARED_CHUNK]:
        `import{s}from"./${ENTRY}";` +
        `const m=${JSON.stringify(SUPABASE.marker)};export{s as a,m};`,
    }),
  );

  assert.equal(result.status, 1, result.stdout);
  assert.match(
    result.stderr,
    /chunk-CXxEgy1j\.js is part of the initial bundle and carries @supabase\/supabase-js/,
  );
  assert.doesNotMatch(result.stderr, /exifr|heic-to|@noble|@jsquash/);
});

test('counts a module preload as part of the initial bundle', () => {
  const result = runGuard(
    buildOutput('module-preload', {
      'index.html':
        `<link rel="modulepreload" href="${LIBRARY_CHUNK}">` +
        `<script src="${POLYFILLS}" type="module"></script>` +
        `<script src="${ENTRY}" type="module"></script>`,
    }),
  );

  assert.equal(result.status, 1, result.stdout);
  assert.match(
    result.stderr,
    /chunk-L1bsK7qz\.js is part of the initial bundle/,
  );
});

test('rejects a build in which a marker appears in no lazy chunk, rather than passing it', () => {
  const result = runGuard(
    buildOutput('marker-gone', {
      [LIBRARY_CHUNK]: libraryChunk(({ library }) => library !== WEBP.library),
    }),
  );

  assert.equal(
    result.status,
    1,
    `the guard passed a build it could not see @jsquash/webp in: ${result.stdout}`,
  );
  assert.match(
    result.stderr,
    /no lazy chunk in .* contains "webp_enc\.wasm", the marker for @jsquash\/webp/,
  );
});

// `npm run build:pages` builds with `--base-href /spotmap-website/`, so index.html carries that
// base and may address its entry scripts through it.
test('tells the initial bundle from lazy chunks in the deployed /spotmap-website/ layout too', () => {
  const base = '/spotmap-website/';
  const index =
    `<base href="${base}">` +
    `<script src="${base}${POLYFILLS}" type="module"></script>` +
    `<script src="${base}${ENTRY}" type="module"></script>`;

  const genuine = runGuard(
    buildOutput('deployed-layout', { 'index.html': index }),
  );
  const leaked = runGuard(
    buildOutput('deployed-layout-leak', {
      'index.html': index,
      [ENTRY]: `import"./${LIBRARY_CHUNK}";export{};`,
    }),
  );

  assert.equal(genuine.status, 0, genuine.stderr);
  assert.equal(leaked.status, 1, leaked.stdout);
  assert.match(leaked.stderr, /is part of the initial bundle/);
});

test('rejects output it cannot read the initial bundle from, rather than passing', () => {
  for (const [name, overrides] of [
    ['no-index', { 'index.html': null }],
    [
      'index-without-scripts',
      { 'index.html': '<html><body>no module scripts</body></html>' },
    ],
    ['entry-scripts-missing', { [POLYFILLS]: null, [ENTRY]: null }],
  ]) {
    const result = runGuard(buildOutput(name, overrides));

    assert.equal(
      result.status,
      1,
      `the guard passed output it could not find the initial bundle in (${name}): ${result.stdout}`,
    );
    assert.match(result.stderr, /index\.html/);
  }
});

test('exits 1 with the usage line when no output directory is given', () => {
  const result = spawnSync(process.execPath, [guard], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /usage: node .*verify-initial-bundle\.mjs <browser-output-dir>/,
  );
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
      `<script src="${POLYFILLS}" type="module"></script>` +
      `<script src="${ENTRY}" type="module"></script>`,
    [POLYFILLS]: 'var t=1;export{t};',
    // Since Angular 22.2 a lazy route's import is written as a template literal.
    [ENTRY]:
      `import{a as e}from"./${SHARED_CHUNK}";` +
      `let r=()=>import(\`./${ADMIN_CHUNK}\`);export{e,r};`,
    [SHARED_CHUNK]: `import{s}from"./${ENTRY}";export{s as a};`,
    [ADMIN_CHUNK]: `import{a as o}from"./${ENTRY}";import"./${LIBRARY_CHUNK}";export{o};`,
    [LIBRARY_CHUNK]: libraryChunk(),
    ...overrides,
  };

  for (const [file, source] of Object.entries(files)) {
    if (source !== null) writeFileSync(join(dir, file), source);
  }
  return dir;
}

/** A lazy chunk carrying the markers of the admin libraries `keep` selects (all by default). */
function libraryChunk(keep = () => true) {
  const literals = ADMIN_LIBRARY_MARKERS.filter(keep).map(({ marker }) =>
    JSON.stringify(marker),
  );
  return `const l=[${literals.join(',')}];export{l};`;
}
