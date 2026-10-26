/**
 * Tests for the insert plan: an extracted spot is inserted only when the database at the start of
 * the run holds neither its id nor a spot like it — any spot within POSITION_MATCH_MAX_M (25 m),
 * or one of the identical name within NAME_MATCH_MAX_M (100 m).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { planInserts } from './insert-plan.mjs';

/**
 * Metres per degree of latitude on match.mjs's haversine sphere (radius 6,371 km): two points on
 * one meridian are exactly `Δlat × M_PER_DEGREE_LAT` apart, so the fixtures sit at exact distances.
 */
const M_PER_DEGREE_LAT = (6_371_000 * Math.PI) / 180;
const LNG = 15.4395;
const LAT = 47.0707;

/** The latitude `metres` north of {@link LAT} (south when negative). */
const north = (metres) => LAT + metres / M_PER_DEGREE_LAT;

/** An extracted payload row at ({@link LNG}, `lat`). */
function extracted(id, { name = `Spot ${id}`, lat = LAT } = {}) {
  return {
    id,
    city: 'graz',
    name,
    status: 'active',
    lng: LNG,
    lat,
    notes: null,
    sources: [{ map: 'graz' }],
    photos: [],
  };
}

/** A `sync_existing_spots()` row at ({@link LNG}, `lat`). */
function existing(
  id,
  { name = `Existing ${id}`, lat = LAT, deleted = false } = {},
) {
  return { id, city: 'graz', name, lng: LNG, lat, deleted };
}

/** Asserts that `plan` holds exactly one possible duplicate, as expected, to the centimetre. */
function assertOneDuplicate(plan, { id, duplicateOf, reason, distanceM }) {
  assert.equal(plan.possibleDuplicates.length, 1, 'one possible duplicate');
  const [duplicate] = plan.possibleDuplicates;
  assert.deepEqual(
    {
      id: duplicate.id,
      duplicateOf: duplicate.duplicateOf,
      reason: duplicate.reason,
    },
    { id, duplicateOf, reason },
  );
  assert.ok(
    Math.abs(duplicate.distanceM - distanceM) < 0.01,
    `distance ${duplicate.distanceM} m, expected ${distanceM} m`,
  );
  assert.deepEqual(plan.inserts, [], 'a possible duplicate is not inserted');
}

/** The ids `plan` inserts. */
const insertedIds = (plan) => plan.inserts.map(({ id }) => id);

test('a spot whose id the database holds is already present, wherever it is and whatever it is called there', () => {
  const plan = planInserts(
    [extracted('a-1')],
    [existing('a-1', { name: 'Renamed', lat: north(5000) })],
  );

  assert.deepEqual(plan, {
    inserts: [],
    alreadyPresent: ['a-1'],
    possibleDuplicates: [],
  });
});

test('an existing spot 24.9 m away makes a position duplicate; one 25.1 m away does not', () => {
  assertOneDuplicate(
    planInserts(
      [extracted('new-1')],
      [existing('old-1', { lat: north(24.9) })],
    ),
    { id: 'new-1', duplicateOf: 'old-1', reason: 'position', distanceM: 24.9 },
  );

  const beyond = planInserts(
    [extracted('new-1')],
    [existing('old-1', { lat: north(25.1) })],
  );
  assert.deepEqual(insertedIds(beyond), ['new-1']);
  assert.deepEqual(beyond.possibleDuplicates, []);
});

test('the identical name 99.9 m away makes a name duplicate; 100.1 m away, or another spelling, does not', () => {
  const plan = (name, metres) =>
    planInserts(
      [extracted('new-1', { name: 'Hbf Curb' })],
      [existing('old-1', { name, lat: north(metres) })],
    );

  assertOneDuplicate(plan('Hbf Curb', 99.9), {
    id: 'new-1',
    duplicateOf: 'old-1',
    reason: 'name',
    distanceM: 99.9,
  });
  assert.deepEqual(insertedIds(plan('Hbf Curb', 100.1)), ['new-1']);
  assert.deepEqual(insertedIds(plan('Hbf curb', 50)), ['new-1']);
  assert.deepEqual(insertedIds(plan('Hbf Curb ', 50)), ['new-1']);
});

test('the nearest matching spot is reported, and a position match wins over a name match', () => {
  assertOneDuplicate(
    planInserts(
      [extracted('new-1', { name: 'Ledge' })],
      [
        existing('farther-1', { lat: north(20) }),
        existing('nearer-1', { lat: north(-10) }),
        existing('same-name', { name: 'Ledge', lat: north(60) }),
      ],
    ),
    { id: 'new-1', duplicateOf: 'nearer-1', reason: 'position', distanceM: 10 },
  );

  assertOneDuplicate(
    planInserts(
      [extracted('new-1', { name: 'Ledge' })],
      [
        existing('farther-1', { name: 'Ledge', lat: north(80) }),
        existing('nearer-1', { name: 'Ledge', lat: north(-40) }),
      ],
    ),
    { id: 'new-1', duplicateOf: 'nearer-1', reason: 'name', distanceM: 40 },
  );
});

test('deleted spots count: their ids are present, and their positions and names are taken', () => {
  const plan = planInserts(
    [
      extracted('a-1'),
      extracted('new-1'),
      extracted('new-2', { name: 'Gone Rail', lat: north(-1000) }),
    ],
    [
      existing('a-1', { deleted: true, lat: north(5000) }),
      existing('old-1', { deleted: true, lat: north(10) }),
      existing('old-2', {
        name: 'Gone Rail',
        deleted: true,
        lat: north(-1060),
      }),
    ],
  );

  assert.deepEqual(plan.alreadyPresent, ['a-1']);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(
    plan.possibleDuplicates.map(({ id, duplicateOf, reason, distanceM }) => [
      id,
      duplicateOf,
      reason,
      Math.round(distanceM),
    ]),
    [
      ['new-1', 'old-1', 'position', 10],
      ['new-2', 'old-2', 'name', 60],
    ],
  );
});

test('extracted spots are compared only with the database at the start of the run', () => {
  const plan = planInserts(
    [extracted('a-1'), extracted('b-2', { lat: north(5) })],
    [],
  );

  assert.deepEqual(insertedIds(plan), ['a-1', 'b-2']);
  assert.deepEqual(plan.possibleDuplicates, []);
});

test('a spot unlike anything in the database is inserted as its own payload row, in payload order', () => {
  const rows = [extracted('b-2', { lat: north(1000) }), extracted('a-1')];

  const plan = planInserts(rows, [existing('far-1', { lat: north(500) })]);

  assert.deepEqual(plan, {
    inserts: rows,
    alreadyPresent: [],
    possibleDuplicates: [],
  });
  assert.equal(plan.inserts[0], rows[0], 'the row itself, not a copy');
});
