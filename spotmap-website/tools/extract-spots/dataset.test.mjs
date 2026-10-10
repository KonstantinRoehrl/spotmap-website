/**
 * Tests for turning parsed placemarks and photo outcomes into a city's GeoJSON and run report.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildCity, photoKey, prepareSpots, toJsonText } from './dataset.mjs';
import { spotId } from './ids.mjs';

const MYMAPS_A =
  'https://mymaps.usercontent.google.com/hostedimage/m/*/AAA?fife=s16383';
const DEAD_B = 'https://lh3.googleusercontent.com/umsh/BBB';
const DEAD_C = 'https://lh3.googleusercontent.com/umsh/CCC';

const PLACEMARKS = [
  {
    name: 'Wien: Curbs',
    styleUrl: '#icon-1899-0288D1',
    coordinates: [16.1, 48.1],
    mediaUrls: [MYMAPS_A, DEAD_B],
  },
  {
    name: 'R.I.P Wien: Gap',
    styleUrl: '#icon-1899-F57C00-nodesc',
    coordinates: [16.2, 48.2],
    mediaUrls: [],
  },
  {
    name: 'Wels: Park',
    styleUrl: '#icon-1899-7CB342-labelson',
    coordinates: [14.0, 48.1],
    mediaUrls: [DEAD_C],
  },
];
const PREFIXES = ['Wien', 'R.I.P Wien'];

function vienna() {
  const { spots, warnings } = prepareSpots(PLACEMARKS, PREFIXES);
  const [curbs, , park] = spots;
  const file = `${curbs.id}-0a1b2c3d.webp`;
  const outcomes = new Map([
    [photoKey(curbs.id, 1), { written: true, file, downloaded: true }],
    [photoKey(curbs.id, 2), { dead: true, reason: 'http 404' }],
    [photoKey(park.id, 1), { dead: true, reason: 'http 404' }],
  ]);
  return {
    spots,
    file,
    ...buildCity({ city: 'vienna', mid: 'MID', spots, warnings, outcomes }),
  };
}

test('prepares spots in KML order with cleaned names, statuses and ids', () => {
  const { spots, warnings } = prepareSpots(PLACEMARKS, PREFIXES);
  assert.deepEqual(
    spots.map(({ id, name, status }) => ({ id, name, status })),
    [
      { id: spotId('Curbs', [16.1, 48.1]), name: 'Curbs', status: 'active' },
      { id: spotId('Gap', [16.2, 48.2]), name: 'Gap', status: 'demolished' },
      {
        id: spotId('Wels: Park', [14.0, 48.1]),
        name: 'Wels: Park',
        status: 'unclassified',
      },
    ],
  );
  assert.deepEqual(warnings, []);
});

test('numbers each photo link from 1, in KML order', () => {
  const [curbs] = prepareSpots(PLACEMARKS, PREFIXES).spots;
  assert.deepEqual(curbs.photos, [
    { url: MYMAPS_A, index: 1 },
    { url: DEAD_B, index: 2 },
  ]);
});

test('an unknown pin colour names the placemark', () => {
  const odd = [{ ...PLACEMARKS[0], styleUrl: '#icon-1899-FF0000' }];
  assert.throws(
    () => prepareSpots(odd, PREFIXES),
    /placemark "Wien: Curbs": unknown pin colour FF0000/,
  );
});

test('a photo key joins the spot id and the photo position', () => {
  assert.equal(photoKey('curbs-abc123', 2), 'curbs-abc123#2');
});

test('the collection lists written photos as base-relative paths and drops dead ones', () => {
  const { spots, file, collection } = vienna();
  assert.equal(collection.type, 'FeatureCollection');
  assert.deepEqual(collection.features[0], {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [16.1, 48.1] },
    properties: {
      id: spots[0].id,
      name: 'Curbs',
      status: 'active',
      photos: [`spots/vienna/${file}`],
    },
  });
});

test('a spot whose photos are all dead or absent is still written, with no photos', () => {
  const { collection } = vienna();
  assert.equal(collection.features.length, 3);
  assert.deepEqual(collection.features[1].properties.photos, []);
  assert.deepEqual(collection.features[2].properties.photos, []);
});

test('no Google URL reaches the GeoJSON or the report', () => {
  const { collection, report } = vienna();
  assert.doesNotMatch(JSON.stringify(collection), /google/);
  assert.doesNotMatch(JSON.stringify(report), /google/);
});

test('the report counts in KML order', () => {
  const { spots, report } = vienna();
  assert.deepEqual(Object.keys(report), [
    'city',
    'mid',
    'placemarks',
    'spotsWritten',
    'photosLinked',
    'photosWritten',
    'photosDead',
    'spotsWithoutPhotos',
    'statusCounts',
    'warnings',
  ]);
  assert.deepEqual(report, {
    city: 'vienna',
    mid: 'MID',
    placemarks: 3,
    spotsWritten: 3,
    photosLinked: 3,
    photosWritten: 1,
    photosDead: [
      { spotId: spots[0].id, index: 2, reason: 'http 404' },
      { spotId: spots[2].id, index: 1, reason: 'http 404' },
    ],
    spotsWithoutPhotos: [spots[1].id, spots[2].id],
    statusCounts: { active: 1, demolished: 1, unclassified: 1 },
    warnings: [],
  });
});

test('a photo without an outcome is a bug, not a silent drop', () => {
  const { spots, warnings } = prepareSpots(PLACEMARKS, PREFIXES);
  assert.throws(
    () =>
      buildCity({
        city: 'vienna',
        mid: 'MID',
        spots,
        warnings,
        outcomes: new Map(),
      }),
    /no download outcome for photo 1 of spot curbs-/,
  );
});

test('JSON text is 2-space indented with a trailing newline', () => {
  assert.equal(toJsonText({ a: [1] }), '{\n  "a": [\n    1\n  ]\n}\n');
});
