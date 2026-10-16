/**
 * Tests for the served record: the one shape both the bundled snapshot (promote.mjs) and the
 * live database (tools/sync-supabase) carry for a spot.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { notesOf, photoObjectKey, servedProperties } from './served-record.mjs';

/** A data/spots feature's properties as the extraction writes them. */
const PROPERTIES = {
  id: 'murinsel-a1b2c3',
  name: 'Murinsel',
  status: 'active',
  photos: [
    'spots/graz/murinsel-a1b2c3-0f0f0f0f.webp',
    'spots/graz/murinsel-a1b2c3-1e1e1e1e.webp',
  ],
  sources: [
    { map: 'graz', folder: 'Graz' },
    { map: 'balkan', description: 'ledges by the river' },
  ],
};

test('photoObjectKey drops the spots/ prefix of a dataset photo path', () => {
  assert.equal(
    photoObjectKey('spots/vienna/hbf-curb-99f6e5-9f98eefd.webp'),
    'vienna/hbf-curb-99f6e5-9f98eefd.webp',
  );
});

test('photoObjectKey rejects anything but spots/<city>/<file>.webp', () => {
  for (const path of [
    'vienna/a.webp',
    'spots/vienna/a.jpg',
    'spots/vienna/sub/a.webp',
    '/spots/vienna/a.webp',
  ]) {
    assert.throws(
      () => photoObjectKey(path),
      new RegExp(`not a dataset photo path: "${path.replaceAll('.', '\\.')}"`),
    );
  }
});

test('notesOf takes the first source with a description, the city map first', () => {
  assert.equal(
    notesOf([
      { map: 'vienna', description: 'own map' },
      { map: 'balkan', description: 'extra map' },
    ]),
    'own map',
  );
});

test('notesOf skips missing and whitespace-only descriptions', () => {
  assert.equal(
    notesOf([
      { map: 'vienna' },
      { map: 'linz', description: '  \n ' },
      { map: 'balkan', description: 'ledges' },
    ]),
    'ledges',
  );
});

test('notesOf keeps the text verbatim, newlines and surrounding spaces included', () => {
  assert.equal(
    notesOf([{ map: 'vienna', description: ' line one\nline two ' }]),
    ' line one\nline two ',
  );
});

test('notesOf is null when no source has notes', () => {
  assert.equal(notesOf([{ map: 'vienna', folder: 'Wien' }]), null);
  assert.equal(notesOf([]), null);
});

test('servedProperties keeps id, name and status, adds notes and maps photos to keys', () => {
  assert.deepEqual(servedProperties(PROPERTIES), {
    id: 'murinsel-a1b2c3',
    name: 'Murinsel',
    status: 'active',
    notes: 'ledges by the river',
    photos: [
      'graz/murinsel-a1b2c3-0f0f0f0f.webp',
      'graz/murinsel-a1b2c3-1e1e1e1e.webp',
    ],
  });
});

test('servedProperties emits its keys in the served order and drops sources', () => {
  assert.deepEqual(Object.keys(servedProperties(PROPERTIES)), [
    'id',
    'name',
    'status',
    'notes',
    'photos',
  ]);
});

test('servedProperties writes notes as null, never omits them', () => {
  const served = servedProperties({
    ...PROPERTIES,
    sources: [{ map: 'graz' }],
  });
  assert.ok('notes' in served);
  assert.equal(served.notes, null);
});

test('servedProperties leaves its input untouched', () => {
  const before = structuredClone(PROPERTIES);
  servedProperties(PROPERTIES);
  assert.deepEqual(PROPERTIES, before);
});
