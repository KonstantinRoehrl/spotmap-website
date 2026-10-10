/**
 * Tests for the pin-colour → status table. Status follows the pin colour, not the folder:
 * Vienna's "Wien: Schönbrunn" is orange inside the "Wien" folder.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { STATUS_BY_COLOUR, statusFor } from './status.mjs';

test('the table holds exactly the colours measured in the exports', () => {
  assert.deepEqual(STATUS_BY_COLOUR, {
    '0288D1': 'active',
    '3949AB': 'active',
    '006064': 'active',
    F57C00: 'demolished',
    '7CB342': 'unclassified',
  });
});

test('maps every table colour in the bare placemark form', () => {
  for (const [colour, status] of Object.entries(STATUS_BY_COLOUR)) {
    assert.equal(statusFor(`#icon-1899-${colour}`), status);
  }
});

test('reads the -labelson form', () => {
  assert.equal(statusFor('#icon-1899-F57C00-labelson'), 'demolished');
});

test('reads the -nodesc form', () => {
  assert.equal(statusFor('#icon-1899-7CB342-nodesc'), 'unclassified');
});

test('reads a lower-case colour', () => {
  assert.equal(statusFor('#icon-1899-0288d1'), 'active');
});

test('throws on a colour outside the table, naming it', () => {
  assert.throws(
    () => statusFor('#icon-1899-FF0000'),
    /unknown pin colour FF0000/,
  );
});

test('throws on a style without a pin colour', () => {
  assert.throws(
    () => statusFor('#style-1'),
    /no pin colour in styleUrl "#style-1"/,
  );
});
