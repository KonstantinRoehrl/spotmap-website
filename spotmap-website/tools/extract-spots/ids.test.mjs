/**
 * Tests for spot names, ids and photo file names. Ids and photo names are what make re-runs
 * stable: the same placemark and the same photo must always produce the same strings.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  assignIds,
  cleanName,
  photoFileName,
  slugify,
  spotId,
} from './ids.mjs';

const VIENNA = ['Wien', 'R.I.P Wien'];

test('strips the city’s own prefix', () => {
  assert.equal(cleanName('Wien: Hbf Curb', VIENNA), 'Hbf Curb');
});

test('strips the R.I.P Wien prefix', () => {
  assert.equal(
    cleanName('R.I.P Wien: Seestadt Curbs', VIENNA),
    'Seestadt Curbs',
  );
});

test('keeps a prefix that names another town', () => {
  assert.equal(cleanName('Wels: Skatepark', ['Linz']), 'Wels: Skatepark');
});

test('leaves a name without a prefix alone', () => {
  assert.equal(cleanName('Riva Ledges', ['Split']), 'Riva Ledges');
});

test('matches a prefix exactly and case-sensitively', () => {
  assert.equal(cleanName('wien: Curbs', VIENNA), 'wien: Curbs');
});

test('slugs the way the Vienna pilot did', () => {
  assert.equal(slugify('Hütteldorfer Rail R.I.P'), 'huetteldorfer-rail-r-i-p');
  assert.equal(slugify('R.I.P. Stadtpark 8 Stair'), 'r-i-p-stadtpark-8-stair');
  assert.equal(
    slugify('R.I.P Seestadt Wood Curbs'),
    'r-i-p-seestadt-wood-curbs',
  );
});

test('transliterates German letters and strips other diacritics', () => {
  assert.equal(slugify('Straße Größe Ärger'), 'strasse-groesse-aerger');
  assert.equal(slugify('Náměstí Míru'), 'namesti-miru');
});

test('falls back to "spot" when nothing sluggable is left', () => {
  assert.equal(slugify('***'), 'spot');
  assert.equal(slugify(''), 'spot');
});

test('spot id is the slug plus a hash of the rounded coordinates', () => {
  const hash = createHash('sha1')
    .update('16.378549,48.184084')
    .digest('hex')
    .slice(0, 6);
  assert.equal(
    spotId('Hbf Curb', [16.3785491, 48.1840844]),
    `hbf-curb-${hash}`,
  );
});

test('spot id is deterministic and changes with the coordinates', () => {
  const id = spotId('Curbs', [16.1, 48.1]);
  assert.equal(spotId('Curbs', [16.1, 48.1]), id);
  assert.notEqual(spotId('Curbs', [16.1, 48.2]), id);
  assert.match(id, /^curbs-[0-9a-f]{6}$/);
});

test('assignIds suffixes a repeated id and records a warning', () => {
  const { ids, warnings } = assignIds(['a', 'a', 'b', 'a']);
  assert.deepEqual(ids, ['a', 'a-2', 'b', 'a-3']);
  assert.deepEqual(warnings, [
    'duplicate spot id a renamed to a-2',
    'duplicate spot id a renamed to a-3',
  ]);
});

test('assignIds leaves unique ids alone', () => {
  assert.deepEqual(assignIds(['x', 'y']), { ids: ['x', 'y'], warnings: [] });
});

test('photo file name joins the spot id and the photo fingerprint', () => {
  assert.equal(
    photoFileName('curbs-abc123', '0a1b2c3d'),
    'curbs-abc123-0a1b2c3d.webp',
  );
});
