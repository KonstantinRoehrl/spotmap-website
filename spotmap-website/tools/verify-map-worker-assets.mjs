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
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const WORKER_FILENAME = 'maplibre-gl-worker.mjs';

const outputDir = process.argv[2];
if (!outputDir) {
  fail(
    `usage: node ${relative(process.cwd(), process.argv[1])} <browser-output-dir>`,
  );
}

const root = resolve(outputDir);
const chunks = jsFilesIn(root).filter((file) =>
  readFileSync(file, 'utf8').includes(WORKER_FILENAME),
);

if (chunks.length === 0) {
  fail(
    `no bundle in ${outputDir} references ${WORKER_FILENAME}. Either maplibre-gl is no longer part ` +
      `of the build, or it changed how it loads its worker — check whether the angular.json asset ` +
      `copy still names the right files, then update this check.`,
  );
}

// The runtime resolves the worker against the URL of the chunk that asks for it, so the worker has
// to sit next to that chunk — and the modules the worker imports next to the worker, and so on.
for (const chunk of chunks) {
  requireSiblingModule(chunk, WORKER_FILENAME);
}

console.log(`maplibre worker assets present in ${outputDir}`);

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

function jsFilesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFilesIn(path);
    return entry.isFile() && (path.endsWith('.js') || path.endsWith('.mjs'))
      ? [path]
      : [];
  });
}

function fail(message) {
  console.error(`maplibre worker asset check failed: ${message}`);
  process.exit(1);
}
