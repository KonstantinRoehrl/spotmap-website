/**
 * Tests for the per-map report: which maps get one, and which placemarks no city — or several
 * cities — claim.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildMapReport, reportedMaps } from './map-report.mjs';

const MAPS = { vienna: 'V', split: 'S', balkan: 'B', shared: 'H' };
const CITIES = {
  vienna: { map: 'vienna', namePrefixes: ['Wien'] },
  split: { map: 'split', namePrefixes: ['Split'], extraMaps: ['balkan'] },
  zadar: { map: 'balkan', namePrefixes: ['Zadar'], onlyPrefixed: true },
  north: { map: 'shared', namePrefixes: ['North'], onlyPrefixed: true },
  south: { map: 'shared', namePrefixes: ['South'], onlyPrefixed: true },
};

/** A Balkan placemark at `ordinal`. */
function placemark(ordinal, name) {
  return {
    ordinal,
    name,
    styleUrl: '#icon-1899-0288D1',
    coordinates: [16, 43],
    mediaUrls: ['x'],
  };
}

test('extra maps and maps shared as a main map get a report, in registry order', () => {
  assert.deepEqual(reportedMaps(MAPS, CITIES), ['balkan', 'shared']);
});

test('lists the placemarks no city claims, with their full record', () => {
  const { report, warnings } = buildMapReport({
    map: 'balkan',
    mid: 'B',
    placemarks: [
      placemark(0, 'Split: Riva'),
      placemark(1, 'Zadar: Ledge'),
      placemark(2, 'Pula: Bank'),
    ],
    claimsByCity: { split: [0], zadar: [1] },
  });
  assert.deepEqual(report, {
    map: 'balkan',
    mid: 'B',
    placemarks: 3,
    unclaimed: [
      { ordinal: 2, name: 'Pula: Bank', position: [16, 43], photoLinks: 1 },
    ],
    multiplyClaimed: [],
  });
  assert.deepEqual(warnings, [
    'balkan: placemark #2 "Pula: Bank" is claimed by no city',
  ]);
});

test('lists a placemark several cities claim, naming them in registry order', () => {
  const { report, warnings } = buildMapReport({
    map: 'balkan',
    mid: 'B',
    placemarks: [placemark(0, 'Punkt 47')],
    claimsByCity: { split: [0, 0], zadar: [0] },
  });
  assert.deepEqual(report.multiplyClaimed, [
    {
      ordinal: 0,
      name: 'Punkt 47',
      position: [16, 43],
      photoLinks: 1,
      claimedBy: ['split', 'zadar'],
    },
  ]);
  assert.deepEqual(report.unclaimed, []);
  assert.deepEqual(warnings, [
    'balkan: placemark #0 "Punkt 47" is claimed by split, zadar',
  ]);
});
