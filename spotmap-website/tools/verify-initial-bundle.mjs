#!/usr/bin/env node
/**
 * Fails the build when a library only the maintainer tool needs ships in the initial bundle.
 *
 * The admin tool pulls in supabase-js, an EXIF reader, a HEIC decoder, a WebAssembly WebP encoder
 * and a hash library — several megabytes no visitor of the public map ever runs. They are meant to
 * load only when someone opens /admin: through a dynamic `import()`, or from files that only the
 * lazy admin route tree imports. One stray static import — a value import where `import type` was
 * meant, or a root-provided token whose default factory names the library — moves a library into
 * the initial bundle, and the site still builds and still works, just slower for everybody. Only a
 * check on the production output catches that, so this runs as part of the deploy build.
 *
 * The initial bundle is what the browser fetches before the app makes its first lazy import: the
 * scripts and module preloads index.html lists, and every module they reach through static imports
 * (`from"./chunk-X.js"`, `import"./chunk-X.js"`). A dynamic `import("./chunk-X.js")` is an edge the
 * browser follows only on demand, so the walk stops there. Each library is recognised by a marker:
 * a string literal of its own code that survives minification. A marker in an initial file fails
 * the check, and so does a marker found in no lazy file either — then the library was dropped,
 * renamed or minified differently, and the check would pass without proving anything.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';

/**
 * The libraries the initial bundle must not carry, each with a string literal from its own source
 * that a production build keeps verbatim (picked from a production build of the admin tool). When
 * a library update drops one, pick a new string from that library's lazy chunk.
 */
export const ADMIN_LIBRARY_MARKERS = Object.freeze([
  // Thrown by the SupabaseClient constructor (supabase-js dist/index.mjs).
  { library: '@supabase/supabase-js', marker: 'supabaseKey is required.' },
  // Thrown when no file parser accepts the input (exifr dist/lite.esm.mjs).
  { library: 'exifr', marker: 'Unknown file format' },
  // The encoder's WebAssembly file, located at runtime (codec/enc/webp_enc.js).
  { library: '@jsquash/webp', marker: 'webp_enc.wasm' },
  // An error of the bundled libheif decoder (heic-to dist/heic-to.js).
  { library: 'heic-to', marker: 'Could not parse HEIF file' },
  // Thrown by every hash once digested twice (@noble/hashes utils.js).
  { library: '@noble/hashes', marker: 'digest() was already called' },
]);

const INDEX_FILENAME = 'index.html';
// Static module edges as the bundler minifies them: `import{a as b}from"./chunk-X.js"`,
// `export*from"./chunk-X.js"` and the bare `import"./chunk-X.js"`. A dynamic import has a
// parenthesis between `import` and its specifier, so it never matches.
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*(["'])(\.{1,2}\/[^"']+)\1/g;
const SCRIPT_SRC = /<script\b[^>]*\bsrc="([^"]+)"/g;
const MODULE_PRELOAD = /<link\b[^>]*\brel="modulepreload"[^>]*>/g;
const HREF = /\bhref="([^"]+)"/;
const BASE_HREF = /<base\b[^>]*\bhref="([^"]*)"/;
// Served from somewhere else (another origin or scheme), so not part of this build.
const NOT_BUILT_HERE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const JAVASCRIPT_FILE = /\.m?js$/;

if (import.meta.main) {
  main(process.argv[2]);
}

/**
 * Runs the check on one browser output directory: prints one line and returns when every admin
 * library stays lazy, otherwise prints every problem it found and exits 1.
 *
 * @param {string | undefined} outputDir the browser output directory of a finished build
 */
function main(outputDir) {
  if (!outputDir) {
    fail(
      `usage: node ${relative(process.cwd(), process.argv[1])} <browser-output-dir>`,
    );
  }

  const root = resolve(outputDir);
  let indexHtml;
  try {
    indexHtml = readFileSync(join(root, INDEX_FILENAME), 'utf8');
  } catch {
    fail(
      `${INDEX_FILENAME} is missing from ${outputDir}, so this check cannot tell the initial ` +
        `bundle from lazy chunks — point it at the browser output directory of a finished build.`,
    );
  }

  const entries = entryScripts(indexHtml);
  if (entries.length === 0) {
    fail(
      `${INDEX_FILENAME} in ${outputDir} lists no script to load, so this check cannot tell the ` +
        `initial bundle from lazy chunks — check what the build emitted.`,
    );
  }

  const initial = initialFiles(root, entries);
  if (initial.length === 0) {
    fail(
      `none of the scripts ${INDEX_FILENAME} lists in ${outputDir} could be read, so there is no ` +
        `initial bundle to check — point this at the browser output directory of a finished build.`,
    );
  }

  const sources = new Map(
    javascriptFiles(root).map((file) => [
      file,
      readFileSync(join(root, file), 'utf8'),
    ]),
  );
  const violations = findViolations(
    sources,
    new Set(initial),
    ADMIN_LIBRARY_MARKERS,
  );
  if (violations.length > 0) {
    fail(...violations.map((violation) => describe(violation, outputDir)));
  }

  console.log(
    `admin libraries stay out of the initial bundle in ${outputDir} ` +
      `(${initial.length} initial files, ${ADMIN_LIBRARY_MARKERS.length} libraries checked)`,
  );
}

/**
 * The files index.html makes the browser fetch up front — its scripts, then its module preloads —
 * as paths relative to the output root. A path under `<base href>` is read relative to that base,
 * which is the output root; a URL on another origin was not built here and is left out.
 *
 * @param {string} indexHtml the text of the build's index.html
 * @returns {string[]} output-root-relative POSIX paths, without duplicates
 */
export function entryScripts(indexHtml) {
  const base = indexHtml.match(BASE_HREF)?.[1] ?? '/';
  const urls = [
    ...Array.from(indexHtml.matchAll(SCRIPT_SRC), ([, src]) => src),
    ...Array.from(
      indexHtml.matchAll(MODULE_PRELOAD),
      ([tag]) => tag.match(HREF)?.[1],
    ),
  ];

  const paths = [];
  for (const url of urls) {
    if (!url || NOT_BUILT_HERE.test(url)) continue;
    const path = url.split(/[?#]/)[0];
    const fromRoot = path.startsWith(base) ? path.slice(base.length) : path;
    const file = posix.normalize(fromRoot.replace(/^\/+/, ''));
    if (!paths.includes(file)) paths.push(file);
  }
  return paths;
}

/**
 * The relative specifiers a module imports statically, in source order. Dynamic imports are left
 * out — the browser follows them only when that code runs, which is what keeps a chunk lazy — and
 * so are bare specifiers, which a production build never leaves behind.
 *
 * @param {string} source the text of a minified ES module
 * @returns {string[]} specifiers such as `./chunk-X.js`, without duplicates
 */
export function staticImports(source) {
  return [
    ...new Set(Array.from(source.matchAll(STATIC_IMPORT), (match) => match[2])),
  ];
}

/**
 * Every module of the initial bundle: the entry files and everything they reach through static
 * imports. A specifier that resolves to no emitted file, or outside the output root, is skipped —
 * the browser cannot load it from this build either.
 *
 * @param {string} root absolute path of the browser output directory
 * @param {readonly string[]} entries output-root-relative entry paths, from {@link entryScripts}
 * @returns {string[]} output-root-relative POSIX paths of the files that exist, in walk order
 */
export function initialFiles(root, entries) {
  const queue = [...entries];
  const visited = new Set();
  const found = [];

  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file) || file === '..' || file.startsWith('../')) continue;
    visited.add(file);

    let source;
    try {
      source = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    found.push(file);

    for (const specifier of staticImports(source)) {
      queue.push(posix.normalize(posix.join(posix.dirname(file), specifier)));
    }
  }
  return found;
}

/**
 * Every JavaScript module the build emitted below a directory — entry bundles, lazy chunks and
 * copied `.mjs` assets alike.
 *
 * @param {string} root absolute path of the browser output directory
 * @param {string} [directory] the directory to list, `root` itself by default
 * @returns {string[]} paths relative to `root`, in POSIX form, sorted
 */
export function javascriptFiles(root, directory = root) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...javascriptFiles(root, path));
    else if (JAVASCRIPT_FILE.test(entry.name)) {
      found.push(relative(root, path).split(sep).join(posix.sep));
    }
  }
  return found.sort();
}

/**
 * One problem with one library: `initial` when its marker sits in a file of the initial bundle,
 * `absent` when no lazy file carries the marker, so the check cannot see the library at all.
 *
 * @typedef {{ kind: 'initial', library: string, marker: string, file: string }
 *   | { kind: 'absent', library: string, marker: string }} Violation
 */

/**
 * Checks every marker against the build's JavaScript.
 *
 * @param {ReadonlyMap<string, string>} sources each emitted JavaScript file's text, by output-root-relative path
 * @param {ReadonlySet<string>} initial the output-root-relative paths of the initial bundle
 * @param {readonly { library: string, marker: string }[]} markers the libraries to check
 * @returns {Violation[]} one entry per problem, in marker order then file order; empty when clean
 */
export function findViolations(sources, initial, markers) {
  const violations = [];
  for (const { library, marker } of markers) {
    let inLazyFile = false;
    for (const [file, source] of sources) {
      if (!source.includes(marker)) continue;
      if (initial.has(file)) {
        violations.push({ kind: 'initial', library, marker, file });
      } else {
        inLazyFile = true;
      }
    }
    if (!inLazyFile) violations.push({ kind: 'absent', library, marker });
  }
  return violations;
}

/**
 * The message for one violation, written for whoever broke the build.
 *
 * @param {Violation} violation
 * @param {string} outputDir the directory as given on the command line
 * @returns {string}
 */
function describe(violation, outputDir) {
  const { library, marker } = violation;
  if (violation.kind === 'initial') {
    return (
      `${violation.file} is part of the initial bundle and carries ${library} (it contains ` +
      `"${marker}"), so every visitor downloads it, admin or not. Something the initial bundle ` +
      `loads imports it statically: reach ${library} only through a dynamic import() or from ` +
      `files only the lazy admin routes import, and import its types with \`import type\`.`
    );
  }
  return (
    `no lazy chunk in ${outputDir} contains "${marker}", the marker for ${library}, so this ` +
    `check cannot tell whether ${library} stays out of the initial bundle. Either the admin tool ` +
    `stopped using ${library}, or a new version of it no longer carries that string: find a ` +
    `string its chunk in a production build keeps verbatim and update its marker in ` +
    `tools/verify-initial-bundle.mjs.`
  );
}

/**
 * Prints each message as a failure of this check and exits 1.
 *
 * @param {...string} messages
 * @returns {never}
 */
function fail(...messages) {
  for (const message of messages) {
    console.error(`initial bundle check failed: ${message}`);
  }
  process.exit(1);
}
