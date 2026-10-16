#!/usr/bin/env node
/**
 * Fails the build when a stylesheet asks for an asset by a path the deployed site cannot serve.
 *
 * The site deploys under a prefix (`/spotmap-website/`), which `index.html` carries as its
 * `<base href>`. That base governs how the *document* resolves relative URLs — it does not reach
 * CSS at all: a `url()` resolves against the stylesheet's own address, and a root-absolute
 * `url('/fonts/x.woff2')` skips both and asks the origin for `/fonts/x.woff2`. Under the prefix
 * that file lives at `/spotmap-website/fonts/x.woff2`, so the request 404s while the page still
 * renders — with a fallback font, which on this site means losing the terminal typeface on every
 * page. A dev server rooted at `/` serves the same declaration happily, so only a check against
 * the deployed layout catches it.
 *
 * Two rules, both about the deployed layout rather than about CSS style: a root-absolute `url()`
 * is always wrong here, and a relative one has to resolve to a file that was actually emitted.
 *
 * Scope: the emitted `.css` files only. Angular inlines component stylesheets into JS, so a
 * root-absolute `url()` written in a component's own stylesheet never reaches a file this sees.
 * Today every component-level `url()` is a data URI, which no prefix can break; if one ever
 * points at a real file, this check has to learn to read the bundles too.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// `url(...)` with optional quotes; the lazy body stops at the first closing paren, which is all
// the bundler's own output ever needs.
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
// Anything the browser resolves without touching the deploy prefix: data URIs, absolute URLs,
// protocol-relative URLs, and in-document fragments (SVG filters, gradients).
const NOT_A_FILE_PATH = /^(?:data:|https?:|\/\/|#)/i;

const outputDir = process.argv[2];
if (!outputDir) {
  fail(
    `usage: node ${relative(process.cwd(), process.argv[1])} <browser-output-dir>`,
  );
}

const root = resolve(outputDir);
const stylesheets = cssFilesUnder(root);

if (stylesheets.length === 0) {
  fail(
    `no stylesheet found in ${outputDir}, so there is nothing to check — point this at the ` +
      `browser output directory of a finished build.`,
  );
}

let checked = 0;
for (const stylesheet of stylesheets) {
  const source = readFileSync(stylesheet, 'utf8');
  const where = relative(root, stylesheet);

  for (const [, , reference] of source.matchAll(CSS_URL)) {
    if (NOT_A_FILE_PATH.test(reference)) continue;
    checked++;

    const asset = reference.split(/[?#]/)[0];
    if (asset.startsWith('/')) {
      fail(
        `${where} asks for ${reference} by a root-absolute path. The deployed site lives under a ` +
          `prefix and CSS url() ignores <base href>, so the browser requests it from the origin ` +
          `root and gets a 404. Make it relative to the stylesheet — drop the leading slash — ` +
          `which resolves correctly both under the prefix and on a dev server rooted at /.`,
      );
    }

    if (!existsSync(resolve(dirname(stylesheet), asset))) {
      fail(
        `${where} asks for ${reference}, which the build did not emit next to it. Either the ` +
          `asset stopped being copied into the output, or the path drifted: check what the build ` +
          `writes alongside ${where} and point the declaration at it.`,
      );
    }
  }
}

console.log(
  `stylesheet asset paths resolve under the deploy prefix in ${outputDir} (${checked} checked)`,
);

function cssFilesUnder(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...cssFilesUnder(path));
    else if (entry.name.endsWith('.css')) found.push(path);
  }
  return found;
}

function fail(message) {
  console.error(`stylesheet asset path check failed: ${message}`);
  process.exit(1);
}
