/**
 * Tests for the extraction CLI's argument handling. An unknown city must fail before any network
 * call, so a typo never costs a 16-city run.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseCliArgs } from './cli.mjs';

const CITIES = ['vienna', 'graz', 'split'];

test('runs every city when none is named', () => {
  assert.deepEqual(parseCliArgs([], CITIES), {
    cities: CITIES,
    reencode: false,
  });
});

test('runs only the named cities, each once, in the order given', () => {
  assert.deepEqual(parseCliArgs(['split', 'vienna', 'split'], CITIES).cities, [
    'split',
    'vienna',
  ]);
});

test('reads --reencode', () => {
  assert.deepEqual(parseCliArgs(['vienna', '--reencode'], CITIES), {
    cities: ['vienna'],
    reencode: true,
  });
});

test('rejects an unknown city, listing the known ones', () => {
  assert.throws(
    () => parseCliArgs(['vienna', 'atlantis'], CITIES),
    /unknown city: atlantis \(known: vienna, graz, split\)/,
  );
});

test('rejects an unknown flag', () => {
  assert.throws(
    () => parseCliArgs(['--recheck-dead'], CITIES),
    /--recheck-dead/,
  );
});
