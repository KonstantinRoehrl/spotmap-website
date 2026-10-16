#!/usr/bin/env node
/**
 * Fails the build when MapLibre's web-worker module is missing from the browser output.
 *
 * maplibre-gl does not inline its worker: it builds the worker URL at runtime with
 * `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, which the bundler cannot see through,
 * so the worker is neither bundled nor emitted. angular.json therefore copies the worker (and
 * the shared module the worker itself imports) into the output as assets. When that copy stops
 * happening the app still builds and still loads the map chunk — the worker request just 404s,
 * tiles are never parsed and the map silently never finishes loading. Nothing but a check on
 * the real build output catches that, so this runs as part of the deploy build.
 *
 * Only application code counts as evidence that anything loads the worker. The copied worker
 * names itself — in its own sourceMappingURL comment — so searching the whole output for the
 * filename lets the copy vouch for itself, and a build whose map chunk asks for a worker nobody
 * copies passes. Application code is the module graph the entry scripts in index.html reach
 * through imports, and no copied asset is ever part of it: the bundler cannot see the runtime
 * lookup, which is the whole reason the worker has to be copied instead of bundled.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const WORKER_FILENAME = 'maplibre-gl-worker.mjs';
const INDEX_FILENAME = 'index.html';
// Relative specifiers as the bundler emits them: `from'./main-XXXX.js'`, `import('./chunk-X.js')`.
const IMPORT_SPECIFIER =
  /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']*)["']/g;

const outputDir = process.argv[2];
if (!outputDir) {
  fail(
    `usage: node ${relative(process.cwd(), process.argv[1])} <browser-output-dir>`,
  );
}

const root = resolve(outputDir);
const chunks = [...applicationModules()]
  .filter(([, source]) => source.includes(WORKER_FILENAME))
  .map(([file]) => file);

if (chunks.length === 0) {
  fail(
    `no application bundle in ${outputDir} references ${WORKER_FILENAME} — only copied assets do, ` +
      `and a copy naming itself is no evidence that anything loads it. Either maplibre-gl is no ` +
      `longer part of the build, or it changed how it loads its worker and left the old asset copy ` +
      `behind: check which worker the map chunk asks for now, point the angular.json asset copy at ` +
      `it, then update this check.`,
  );
}

// The runtime resolves the worker against the URL of the chunk that asks for it, so the worker has
// to sit next to that chunk — and the modules the worker imports next to the worker, and so on.
for (const chunk of chunks) {
  requireSiblingModule(chunk, WORKER_FILENAME);
}

console.log(`maplibre worker assets present in ${outputDir}`);

/** Every module the browser loads: the entry scripts of index.html, and what they import. */
function applicationModules() {
  const queue = entryScripts();
  const modules = new Map();

  while (queue.length > 0) {
    const file = queue.shift();
    if (modules.has(file)) continue;

    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue; // Not every specifier resolves to an emitted file; the browser skips those too.
    }
    modules.set(file, source);

    for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
      queue.push(resolve(dirname(file), specifier));
    }
  }

  if (modules.size === 0) {
    fail(
      `none of the scripts ${INDEX_FILENAME} lists in ${outputDir} could be read, so there is no ` +
        `application code to check — point this at the browser output directory of a finished build.`,
    );
  }
  return modules;
}

function entryScripts() {
  const indexFile = join(root, INDEX_FILENAME);
  let html;
  try {
    html = readFileSync(indexFile, 'utf8');
  } catch {
    fail(
      `${INDEX_FILENAME} is missing from ${outputDir}, so this check cannot tell application code ` +
        `from copied assets — point it at the browser output directory of a finished build.`,
    );
  }

  // The browser resolves a script src against <base href>, and everything the build emits below
  // that base href sits below the output root.
  const base = html.match(/<base[^>]*\bhref="([^"]*)"/)?.[1] ?? '/';
  const scripts = [];
  for (const [, src] of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) continue; // Served from somewhere else, not built here.
    const path = src.startsWith(base) ? src.slice(base.length) : src;
    scripts.push(join(root, path.replace(/^\//, '')));
  }

  if (scripts.length === 0) {
    fail(
      `${INDEX_FILENAME} in ${outputDir} lists no script to load, so this check cannot tell ` +
        `application code from copied assets — check what the build emitted.`,
    );
  }
  return scripts;
}

function requireSiblingModule(importer, filename, seen = new Set()) {
  const file = join(dirname(importer), filename);
  if (seen.has(file)) return;
  seen.add(file);

  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    fail(
      `${relative(root, file)} is missing from the build output, but ${relative(root, importer)} ` +
        `loads it at runtime. Restore the maplibre-gl asset copy in angular.json — without it the ` +
        `map never finishes loading.`,
    );
  }
  if (source.trim() === '') {
    fail(`${relative(root, file)} is empty in the build output.`);
  }

  for (const match of source.matchAll(/from\s*['"](\.\/[^'"]+)['"]/g)) {
    requireSiblingModule(file, match[1].slice('./'.length), seen);
  }
}

function fail(message) {
  console.error(`maplibre worker asset check failed: ${message}`);
  process.exit(1);
}
