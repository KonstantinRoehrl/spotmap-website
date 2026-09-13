#!/usr/bin/env node
/**
 * Fails when `ng serve` does not serve MapLibre's web-worker module where the map asks for it.
 *
 * maplibre-gl builds its worker URL at runtime from the URL of its own module —
 * `new URL('./maplibre-gl-worker.mjs', import.meta.url)` — so the worker has to sit next to
 * whatever module the dev server actually serves maplibre from. When Vite pre-bundles
 * maplibre-gl into its deps directory, that lookup points into the deps directory, which has
 * no worker in it: the map loads, requests the worker, 404s, parses no tile and never
 * finishes. angular.json keeps maplibre-gl out of the dev server's prebundling so the module
 * stays part of the application bundle at the server root, next to the worker assets.
 *
 * The only way to catch a regression in that is to ask a real dev server for the URL the
 * served module resolves to, so this starts one, walks the served module graph to find the
 * module that builds the worker URL, and requests the worker (and what the worker imports).
 *
 * Usage: node tools/verify-dev-server-map-worker.mjs [port]
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER_FILENAME = 'maplibre-gl-worker.mjs';
const READY_TIMEOUT_MS = 180_000;

const port = Number(process.argv[2] ?? 4271);
const origin = `http://localhost:${port}/`;
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const server = spawn(
  resolve(projectDir, 'node_modules/.bin/ng'),
  ['serve', '--port', String(port)],
  {
    cwd: projectDir,
    stdio: ['ignore', 'inherit', 'inherit'],
  },
);

try {
  await waitForServer();
  const moduleUrl = await findModuleBuildingTheWorkerUrl();
  console.log(`maplibre module served from ${moduleUrl}`);

  const failures = [];
  for (const url of await workerModuleUrls(moduleUrl)) {
    const response = await fetch(url).catch(() => undefined);
    const type = response?.headers.get('content-type') ?? '-';
    console.log(`${response?.status ?? 0} ${type} ${url}`);
    // A 404 page answers with HTML, so the module only really loads when it comes back as script.
    if (response?.status !== 200 || !type.includes('javascript'))
      failures.push(url);
  }
  if (failures.length > 0) {
    fail(
      `the dev server does not serve ${failures.join(', ')} as a module, so the map never parses ` +
        `a tile. Check that angular.json still excludes maplibre-gl from the dev server's ` +
        `prebundling and still copies the maplibre worker assets into the build output.`,
    );
  }
  console.log(`maplibre worker reachable from the dev server on port ${port}`);
} finally {
  server.kill();
}

/** Replicates maplibre's own worker lookup, plus the module the worker itself imports. */
async function workerModuleUrls(moduleUrl) {
  const worker = new URL(
    `./${moduleUrl.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : WORKER_FILENAME}`,
    moduleUrl,
  ).href;
  const urls = [worker];
  const source = await bodyOf(worker);
  for (const match of (source ?? '').matchAll(/from\s*['"](\.\/[^'"]+)['"]/g)) {
    urls.push(new URL(match[1], worker).href);
  }
  return urls;
}

/** Walks the served module graph the browser would walk, entry scripts first. */
async function findModuleBuildingTheWorkerUrl() {
  const queue = [];
  const index = await bodyOf(origin);
  for (const match of (index ?? '').matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
    queue.push(new URL(match[1], origin).href);
  }

  const seen = new Set();
  while (queue.length > 0) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);

    const source = await bodyOf(url);
    if (source === undefined) continue;
    if (source.includes(WORKER_FILENAME)) return url;

    for (const match of source.matchAll(
      /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{0,2}\/[^"']*)["']/g,
    )) {
      queue.push(new URL(match[1], url).href);
    }
  }
  fail(
    `no module served by the dev server references ${WORKER_FILENAME}. Either maplibre-gl is no ` +
      `longer part of the app, or it changed how it loads its worker — check that first, then ` +
      `update this check.`,
  );
}

async function waitForServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await statusOf(origin)) === 200) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  fail(
    `the dev server did not answer on ${origin} within ${READY_TIMEOUT_MS / 1000}s.`,
  );
}

async function statusOf(url) {
  try {
    return (await fetch(url)).status;
  } catch {
    return 0;
  }
}

async function bodyOf(url) {
  const response = await fetch(url).catch(() => undefined);
  return response?.ok ? await response.text() : undefined;
}

function fail(message) {
  console.error(`dev server maplibre worker check failed: ${message}`);
  server.kill();
  process.exit(1);
}
