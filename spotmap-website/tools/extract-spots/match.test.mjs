/**
 * Tests for matching an extra map's placemarks to a city's spots: by name first, then by position,
 * never guessing — conflicts, ties and strays are reported instead.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  describePlacemark,
  distanceMeters,
  matchExtraPlacemarks,
} from './match.mjs';

// At latitude 43.5, 0.0001° of latitude is ~11.1 m.
const RIVA = { id: 'riva-aaaaaa', name: 'Riva', coordinates: [16.44, 43.5] };
const CURB_1 = { id: 'curb-bbbbbb', name: 'Curb', coordinates: [16.45, 43.5] };
const CURB_2 = { id: 'curb-cccccc', name: 'Curb', coordinates: [16.46, 43.5] };
const PREFIXES = ['Split'];

/** An extra-map placemark `dLat` degrees north of `[lng, 43.5]`. */
function placemark(name, lng, dLat = 0, ordinal = 0, mediaUrls = []) {
  return {
    ordinal,
    name,
    styleUrl: '#icon-1899-0288D1',
    coordinates: [lng, 43.5 + dLat],
    mediaUrls,
  };
}

test('a unique name within 100 m is matched by name', () => {
  const extra = placemark('Split: Riva', 16.44, 0.0003);
  const result = matchExtraPlacemarks([RIVA], [extra], PREFIXES);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].spotId, RIVA.id);
  assert.equal(result.matches[0].via, 'name');
  assert.equal(result.matches[0].name, 'Riva');
  assert.ok(Math.abs(result.matches[0].distanceM - 33.36) < 0.1);
  assert.deepEqual(result.conflicts, []);
});

test('a unique name more than 100 m away with the own prefix is a merged conflict', () => {
  const extra = placemark('Split: Riva', 16.44, 0.001);
  const result = matchExtraPlacemarks([RIVA], [extra], PREFIXES);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].merged, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].spotId, RIVA.id);
});

test('a unique name more than 100 m away without the own prefix is reported, not merged', () => {
  const extra = placemark('Riva', 16.44, 0.001);
  const result = matchExtraPlacemarks([RIVA], [extra], PREFIXES);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].merged, false);
  assert.deepEqual(result.matches, []);
});

test('of several same-named spots, the unique one within 25 m is matched', () => {
  const extra = placemark('Split: Curb', 16.45, 0.0002);
  const result = matchExtraPlacemarks([CURB_1, CURB_2], [extra], PREFIXES);
  assert.deepEqual(
    result.matches.map(({ spotId, via }) => [spotId, via]),
    [[CURB_1.id, 'name']],
  );
});

test('several same-named spots with none within 25 m is ambiguous', () => {
  const extra = placemark('Split: Curb', 16.455);
  const result = matchExtraPlacemarks([CURB_1, CURB_2], [extra], PREFIXES);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(
    result.ambiguous.map(({ candidates }) => candidates),
    [[CURB_1.id, CURB_2.id]],
  );
});

test('an unknown name is matched by position to the unique spot within 25 m', () => {
  const extra = placemark('Split: Riva Steps', 16.44, 0.0002);
  const result = matchExtraPlacemarks([RIVA, CURB_1], [extra], PREFIXES);
  assert.deepEqual(
    result.matches.map(({ spotId, via }) => [spotId, via]),
    [[RIVA.id, 'position']],
  );
});

test('an unknown name with several spots within 25 m is ambiguous', () => {
  const twin = {
    id: 'twin-dddddd',
    name: 'Twin',
    coordinates: [16.44, 43.5001],
  };
  const extra = placemark('Split: Somewhere', 16.44, 0.00005);
  const result = matchExtraPlacemarks([RIVA, twin], [extra], PREFIXES);
  assert.deepEqual(
    result.ambiguous.map(({ candidates }) => candidates),
    [[RIVA.id, twin.id]],
  );
});

test('an own-prefixed placemark matching nothing is unmatched; a foreign one is skipped silently', () => {
  const own = placemark('Split: Nowhere', 16.6);
  const foreign = placemark('Zadar: Nowhere', 16.6, 0, 1);
  const result = matchExtraPlacemarks([RIVA], [own, foreign], PREFIXES);
  assert.deepEqual(
    result.unmatched.map(({ placemark: p }) => p.ordinal),
    [0],
  );
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.matches, []);
});

test('two placemarks on one spot are both kept, with a warning naming the spot', () => {
  const first = placemark('Split: Riva', 16.44, 0, 0);
  const second = placemark('Split: Riva', 16.44, 0.0001, 1);
  const result = matchExtraPlacemarks([RIVA], [first, second], PREFIXES);
  assert.deepEqual(
    result.matches.map(({ placemark: p }) => p.ordinal),
    [0, 1],
  );
  assert.deepEqual(result.warnings, [
    `spot ${RIVA.id} is matched by 2 placemarks`,
  ]);
});

test('distances are haversine on a 6,371 km sphere', () => {
  assert.ok(Math.abs(distanceMeters([0, 0], [0, 1]) - 111194.927) < 0.01);
  assert.equal(distanceMeters([16.44, 43.5], [16.44, 43.5]), 0);
});

test('a described placemark keeps its record and counts its photo links', () => {
  assert.deepEqual(
    describePlacemark({
      ordinal: 4,
      name: 'Split: Riva',
      styleUrl: '#icon-1899-0288D1',
      coordinates: [16.44, 43.5],
      mediaUrls: ['a', 'b'],
      folder: 'Kroatien',
      description: 'Police',
    }),
    {
      ordinal: 4,
      name: 'Split: Riva',
      position: [16.44, 43.5],
      folder: 'Kroatien',
      description: 'Police',
      photoLinks: 2,
    },
  );
  const bare = describePlacemark(placemark('Split: Riva', 16.44));
  assert.equal('folder' in bare, false);
  assert.equal('description' in bare, false);
});
