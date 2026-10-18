/**
 * Guards that the duplicate rule has one set of numbers in all three of its homes: the Node tools
 * (tools/extract-spots/match.mjs, which the sync's insert plan uses), the database's
 * admin_nearby_spots() (the maintainer-tool migration) and the browser's create-or-attach step
 * (src/app/services/admin/geo.ts). The SQL and the TypeScript are read as text — Node imports
 * neither — and so is match.mjs for EARTH_RADIUS_M, which it does not export.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  NAME_MATCH_MAX_M,
  POSITION_MATCH_MAX_M,
} from '../extract-spots/match.mjs';
import { APP_ROOT } from '../extract-spots/paths.mjs';

/** The three homes of the rule's numbers. */
const MATCH_SOURCE = join(APP_ROOT, 'tools', 'extract-spots', 'match.mjs');
const MIGRATION = join(
  APP_ROOT,
  'supabase',
  'migrations',
  '20261018000000_maintainer_tool.sql',
);
const GEO_SOURCE = join(APP_ROOT, 'src', 'app', 'services', 'admin', 'geo.ts');

/**
 * The value of a top-level `const <name> = <number>;` (optionally exported or typed `: number`,
 * `_` separators allowed), or undefined when the source declares no such constant.
 *
 * @param {string} source
 * @param {string} name
 * @returns {number | undefined}
 */
function declaredNumber(source, name) {
  const declaration = new RegExp(
    String.raw`^(?:export\s+)?const\s+${name}\s*(?::\s*number\s*)?=\s*([\d_]+(?:\.\d+)?)\s*;`,
    'm',
  ).exec(source);
  return declaration ? Number(declaration[1].replaceAll('_', '')) : undefined;
}

/**
 * The radius of every `st_dwithin(<alias.>location, <point>, <metres>, false)` call, in order.
 * The point expression may contain commas and parentheses; the match stays inside one statement.
 *
 * @param {string} sql
 * @returns {number[]}
 */
function dwithinRadii(sql) {
  const call =
    /st_dwithin\s*\(\s*(?:\w+\.)?location\s*,[^;]*?,\s*(\d+(?:\.\d+)?)\s*,\s*false\s*\)/gi;
  return [...sql.matchAll(call)].map((match) => Number(match[1]));
}

test('the readers find a changed value, and nothing where nothing is declared', () => {
  assert.equal(
    declaredNumber('export const A = 25;\nconst B: number = 6_371_000;', 'B'),
    6_371_000,
  );
  assert.equal(declaredNumber('export const AB = 25;', 'A'), undefined);
  const point =
    'extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography';
  assert.deepEqual(
    dwithinRadii(
      `where extensions.st_dwithin(s.location, ${point}, 30, false);\n` +
        `and extensions.st_dwithin(location, ${point}, 100, false)`,
    ),
    [30, 100],
  );
});

test('match.mjs declares the radius it computes with and the two match distances', async () => {
  const source = await readFile(MATCH_SOURCE, 'utf8');

  assert.equal(declaredNumber(source, 'EARTH_RADIUS_M'), 6_371_000);
  assert.equal(
    declaredNumber(source, 'POSITION_MATCH_MAX_M'),
    POSITION_MATCH_MAX_M,
  );
  assert.equal(declaredNumber(source, 'NAME_MATCH_MAX_M'), NAME_MATCH_MAX_M);
});

test('admin_nearby_spots() searches exactly the two match distances', async () => {
  const radii = dwithinRadii(await readFile(MIGRATION, 'utf8'));

  assert.ok(radii.includes(POSITION_MATCH_MAX_M), `radii: ${radii}`);
  assert.ok(radii.includes(NAME_MATCH_MAX_M), `radii: ${radii}`);
  assert.deepEqual(
    new Set(radii),
    new Set([POSITION_MATCH_MAX_M, NAME_MATCH_MAX_M]),
    'no other radius',
  );
});

test('geo.ts declares the same earth radius and match distances as match.mjs', async () => {
  const [geo, match] = await Promise.all([
    readFile(GEO_SOURCE, 'utf8'),
    readFile(MATCH_SOURCE, 'utf8'),
  ]);

  assert.equal(
    declaredNumber(geo, 'EARTH_RADIUS_M'),
    declaredNumber(match, 'EARTH_RADIUS_M'),
  );
  assert.equal(
    declaredNumber(geo, 'POSITION_MATCH_MAX_M'),
    POSITION_MATCH_MAX_M,
  );
  assert.equal(declaredNumber(geo, 'NAME_MATCH_MAX_M'), NAME_MATCH_MAX_M);
});
