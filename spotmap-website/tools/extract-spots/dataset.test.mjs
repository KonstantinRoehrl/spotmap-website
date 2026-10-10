/**
 * Tests for turning parsed placemarks and photo outcomes into a city's GeoJSON and run report.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  assertNoUrls,
  buildCity,
  findNewlyDeadPhotos,
  mergeExtraMatches,
  photoKey,
  prepareSpots,
  reportMatchEntries,
  toJsonText,
} from './dataset.mjs';
import { spotId } from './ids.mjs';

const MYMAPS_A =
  'https://mymaps.usercontent.google.com/hostedimage/m/*/AAA?fife=s16383';
const DEAD_B = 'https://lh3.googleusercontent.com/umsh/BBB';
const DEAD_C = 'https://lh3.googleusercontent.com/umsh/CCC';

const PLACEMARKS = [
  {
    ordinal: 0,
    name: 'Wien: Curbs',
    styleUrl: '#icon-1899-0288D1',
    coordinates: [16.1, 48.1],
    mediaUrls: [MYMAPS_A, DEAD_B],
    folder: 'Wien',
    description: 'Police',
  },
  {
    ordinal: 1,
    name: 'R.I.P Wien: Gap',
    styleUrl: '#icon-1899-F57C00-nodesc',
    coordinates: [16.2, 48.2],
    mediaUrls: [],
  },
  {
    ordinal: 2,
    name: 'Wels: Park',
    styleUrl: '#icon-1899-7CB342-labelson',
    coordinates: [14.0, 48.1],
    mediaUrls: [DEAD_C],
  },
];
const PREFIXES = ['Wien', 'R.I.P Wien'];

function vienna() {
  const { spots, warnings } = prepareSpots(PLACEMARKS, PREFIXES, 'vienna');
  const [curbs, , park] = spots;
  const file = `${curbs.id}-0a1b2c3d.webp`;
  const outcomes = new Map([
    [
      photoKey(curbs.id, 'vienna', 1),
      { written: true, file, downloaded: true },
    ],
    [photoKey(curbs.id, 'vienna', 2), { dead: true, reason: 'http 404' }],
    [photoKey(park.id, 'vienna', 1), { dead: true, reason: 'http 404' }],
  ]);
  return {
    spots,
    file,
    ...buildCity({
      city: 'vienna',
      map: 'vienna',
      mid: 'MID',
      spots,
      warnings,
      outcomes,
    }),
  };
}

test('prepares spots in KML order with cleaned names, statuses and ids', () => {
  const { spots, warnings } = prepareSpots(PLACEMARKS, PREFIXES, 'vienna');
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
  const [curbs] = prepareSpots(PLACEMARKS, PREFIXES, 'vienna').spots;
  assert.deepEqual(curbs.photos, [
    { url: MYMAPS_A, map: 'vienna', n: 1 },
    { url: DEAD_B, map: 'vienna', n: 2 },
  ]);
});

test('an unknown pin colour names the placemark', () => {
  const odd = [{ ...PLACEMARKS[0], styleUrl: '#icon-1899-FF0000' }];
  assert.throws(
    () => prepareSpots(odd, PREFIXES, 'vienna'),
    /placemark "Wien: Curbs": unknown pin colour FF0000/,
  );
});

test('a photo key joins the spot id, the map and the photo number', () => {
  assert.equal(photoKey('curbs-abc123', 'vienna', 2), 'curbs-abc123#vienna#2');
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
      sources: [{ map: 'vienna', folder: 'Wien', description: 'Police' }],
    },
  });
  assert.deepEqual(collection.features[1].properties.sources, [
    { map: 'vienna' },
  ]);
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
    'map',
    'mid',
    'placemarks',
    'spotsWritten',
    'photosLinked',
    'photosWritten',
    'photosDead',
    'photosRecovered',
    'photosDuplicate',
    'photosNearDuplicate',
    'spotsWithoutPhotos',
    'statusCounts',
    'extraMaps',
    'matches',
    'linkCounts',
    'warnings',
  ]);
  assert.deepEqual(report, {
    city: 'vienna',
    map: 'vienna',
    mid: 'MID',
    placemarks: 3,
    spotsWritten: 3,
    photosLinked: 3,
    photosWritten: 1,
    photosDead: [
      { spotId: spots[0].id, map: 'vienna', n: 2, reason: 'http 404' },
      { spotId: spots[2].id, map: 'vienna', n: 1, reason: 'http 404' },
    ],
    photosRecovered: [],
    photosDuplicate: [],
    photosNearDuplicate: [],
    spotsWithoutPhotos: [spots[1].id, spots[2].id],
    statusCounts: { active: 1, demolished: 1, unclassified: 1 },
    extraMaps: [],
    matches: { conflicts: [], ambiguous: [], unmatched: [] },
    linkCounts: { vienna: { [spots[0].id]: 2, [spots[2].id]: 1 } },
    warnings: [],
  });
});

test('a photo a spot links twice is listed once and reported as a duplicate', () => {
  // Only the outcomes decide which photos match; buildCity never reads the URLs.
  const curbsPlacemark = {
    ...PLACEMARKS[0],
    mediaUrls: [MYMAPS_A, MYMAPS_A, MYMAPS_A],
  };
  const { spots, warnings } = prepareSpots(
    [curbsPlacemark],
    PREFIXES,
    'vienna',
  );
  const [curbs] = spots;
  const first = `${curbs.id}-0a1b2c3d.webp`;
  const second = `${curbs.id}-4e5f6a7b.webp`;
  const outcomes = new Map([
    [photoKey(curbs.id, 'vienna', 1), { written: true, file: first }],
    [photoKey(curbs.id, 'vienna', 2), { written: true, file: second }],
    [photoKey(curbs.id, 'vienna', 3), { written: true, file: first }],
  ]);
  const { collection, report } = buildCity({
    city: 'vienna',
    map: 'vienna',
    mid: 'MID',
    spots,
    warnings,
    outcomes,
  });
  assert.deepEqual(collection.features[0].properties.photos, [
    `spots/vienna/${first}`,
    `spots/vienna/${second}`,
  ]);
  assert.equal(report.photosLinked, 3);
  assert.equal(report.photosWritten, 2);
  assert.deepEqual(report.photosDead, []);
  assert.deepEqual(report.photosDuplicate, [
    { spotId: curbs.id, map: 'vienna', n: 3, sameAs: { map: 'vienna', n: 1 } },
  ]);
});

test('a photo without an outcome is a bug, not a silent drop', () => {
  const { spots, warnings } = prepareSpots(PLACEMARKS, PREFIXES, 'vienna');
  assert.throws(
    () =>
      buildCity({
        city: 'vienna',
        map: 'vienna',
        mid: 'MID',
        spots,
        warnings,
        outcomes: new Map(),
      }),
    /no download outcome for photo vienna#1 of spot curbs-/,
  );
});

/** A previous run's GeoJSON and report, keeping only what the guard reads. */
function previousRun({ photoCounts, photosDead = [], photosDuplicate = [] }) {
  return {
    previousCollection: {
      type: 'FeatureCollection',
      features: Object.entries(photoCounts).map(([id, count]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [16.1, 48.1] },
        properties: {
          id,
          name: id,
          status: 'active',
          photos: Array.from(
            { length: count },
            (_, i) => `spots/vienna/${id}-${i}.webp`,
          ),
        },
      })),
    },
    previousReport: { photosDead, photosDuplicate },
  };
}

test('without previous outputs no dead photo is newly dead', () => {
  const report = {
    map: 'vienna',
    photosDead: [
      { spotId: 'curbs-abc123', map: 'vienna', n: 1, reason: 'http 403' },
    ],
  };
  assert.deepEqual(findNewlyDeadPhotos({ report }), []);
});

test('a photo that was already dead last run is not newly dead', () => {
  const previous = previousRun({
    photoCounts: { 'curbs-abc123': 1 },
    photosDead: [{ spotId: 'curbs-abc123', index: 2, reason: 'http 404' }],
  });
  const report = {
    map: 'vienna',
    photosDead: [
      { spotId: 'curbs-abc123', map: 'vienna', n: 2, reason: 'http 404' },
    ],
  };
  assert.deepEqual(findNewlyDeadPhotos({ ...previous, report }), []);
});

test('a dead position beyond the previous link count is a new link, not newly dead', () => {
  const previous = previousRun({ photoCounts: { 'curbs-abc123': 1 } });
  const report = {
    map: 'vienna',
    photosDead: [
      { spotId: 'curbs-abc123', map: 'vienna', n: 2, reason: 'http 404' },
    ],
  };
  assert.deepEqual(findNewlyDeadPhotos({ ...previous, report }), []);
});

test('a dead photo of a spot the previous run did not have is not newly dead', () => {
  const previous = previousRun({ photoCounts: { 'curbs-abc123': 1 } });
  const report = {
    map: 'vienna',
    photosDead: [
      { spotId: 'gap-def456', map: 'vienna', n: 1, reason: 'http 404' },
    ],
  };
  assert.deepEqual(findNewlyDeadPhotos({ ...previous, report }), []);
});

test('a photo written last run that now comes back dead is newly dead, in KML order', () => {
  const previous = previousRun({
    photoCounts: { 'curbs-abc123': 2, 'gap-def456': 1 },
    photosDead: [{ spotId: 'curbs-abc123', index: 3, reason: 'http 404' }],
  });
  const report = {
    map: 'vienna',
    photosDead: [
      { spotId: 'curbs-abc123', map: 'vienna', n: 2, reason: 'http 403' },
      { spotId: 'curbs-abc123', map: 'vienna', n: 3, reason: 'http 404' },
      {
        spotId: 'gap-def456',
        map: 'vienna',
        n: 1,
        reason: 'content-type text/html',
      },
    ],
  };
  assert.deepEqual(findNewlyDeadPhotos({ ...previous, report }), [
    { spotId: 'curbs-abc123', map: 'vienna', n: 2, reason: 'http 403' },
    {
      spotId: 'gap-def456',
      map: 'vienna',
      n: 1,
      reason: 'content-type text/html',
    },
  ]);
});

test('a position that was a duplicate last run counts as written, so its death is newly dead', () => {
  const previous = previousRun({
    photoCounts: { 'curbs-abc123': 1 },
    photosDuplicate: [{ spotId: 'curbs-abc123', index: 2, sameAs: 1 }],
  });
  const report = {
    map: 'vienna',
    photosDead: [
      { spotId: 'curbs-abc123', map: 'vienna', n: 2, reason: 'http 403' },
    ],
  };
  assert.deepEqual(findNewlyDeadPhotos({ ...previous, report }), [
    { spotId: 'curbs-abc123', map: 'vienna', n: 2, reason: 'http 403' },
  ]);
});

test('JSON text is 2-space indented with a trailing newline', () => {
  assert.equal(toJsonText({ a: [1] }), '{\n  "a": [\n    1\n  ]\n}\n');
});

const BALKAN_A =
  'https://mymaps.usercontent.google.com/hostedimage/m/*/BA?fife=s16383';
const BALKAN_B =
  'https://mymaps.usercontent.google.com/hostedimage/m/*/BB?fife=s16383';
const BALKAN_C =
  'https://mymaps.usercontent.google.com/hostedimage/m/*/BC?fife=s16383';

/** A Balkan placemark matched to `spot`, as matchExtraPlacemarks would produce it. */
function balkanMatch(
  spot,
  {
    ordinal,
    name = spot.name,
    styleUrl = '#icon-1899-0288D1',
    mediaUrls = [],
    ...rest
  },
) {
  return {
    spotId: spot.id,
    name,
    distanceM: 5,
    via: 'name',
    placemark: {
      ordinal,
      name: `Wien: ${name}`,
      styleUrl,
      coordinates: [16.10001, 48.1],
      mediaUrls,
      ...rest,
    },
  };
}

test('prepared spots keep their ordinal and number photos per map', () => {
  const { spots } = prepareSpots(PLACEMARKS, PREFIXES, 'vienna');
  assert.deepEqual(
    spots.map(({ ordinal }) => ordinal),
    [0, 1, 2],
  );
  assert.deepEqual(
    spots[0].photos.map(({ map, n }) => [map, n]),
    [
      ['vienna', 1],
      ['vienna', 2],
    ],
  );
});

test('an extra match adds a source record and numbers its photos on from that map', () => {
  const { spots } = prepareSpots(PLACEMARKS, PREFIXES, 'vienna');
  const [curbs] = spots;
  const merged = mergeExtraMatches(spots, 'balkan', [
    balkanMatch(curbs, {
      ordinal: 7,
      mediaUrls: [BALKAN_A, BALKAN_B],
      folder: 'Austria',
      description: 'Same notes',
    }),
    balkanMatch(curbs, {
      ordinal: 9,
      name: 'Curbs East',
      styleUrl: '#icon-1899-F57C00-nodesc',
      mediaUrls: [BALKAN_C],
    }),
  ]);
  assert.deepEqual(
    merged[0].photos.map(({ map, n }) => [map, n]),
    [
      ['vienna', 1],
      ['vienna', 2],
      ['balkan', 1],
      ['balkan', 2],
      ['balkan', 3],
    ],
  );
  assert.deepEqual(merged[0].sources, [
    { map: 'vienna', folder: 'Wien', description: 'Police' },
    {
      map: 'balkan',
      folder: 'Austria',
      description: 'Same notes',
      position: [16.10001, 48.1],
    },
    {
      map: 'balkan',
      position: [16.10001, 48.1],
      name: 'Curbs East',
      status: 'demolished',
    },
  ]);
  assert.deepEqual(merged[0].coordinates, curbs.coordinates);
  assert.equal(merged[1], spots[1]);
});

/** Outcomes and hashes for Curbs with one main photo and Balkan photos, all written. */
function mixedCurbs({ mainHash, balkanHashes, mainDead = false }) {
  const { spots, warnings } = prepareSpots(
    [{ ...PLACEMARKS[0], mediaUrls: [MYMAPS_A] }],
    PREFIXES,
    'vienna',
  );
  const [curbs] = mergeExtraMatches(spots, 'balkan', [
    balkanMatch(spots[0], {
      ordinal: 3,
      mediaUrls: balkanHashes.map((_, i) => `${BALKAN_A}${i}`),
    }),
  ]);
  const outcomes = new Map([
    [
      photoKey(curbs.id, 'vienna', 1),
      mainDead
        ? { dead: true, reason: 'http 403' }
        : { written: true, file: 'main.webp' },
    ],
    ...balkanHashes.map((_, i) => [
      photoKey(curbs.id, 'balkan', i + 1),
      { written: true, file: `balkan-${i + 1}.webp` },
    ]),
  ]);
  const hashes = new Map([
    ...(mainHash === undefined ? [] : [['main.webp', mainHash]]),
    ...balkanHashes.map((hash, i) => [`balkan-${i + 1}.webp`, hash]),
  ]);
  return buildCity({
    city: 'vienna',
    map: 'vienna',
    mid: 'MID',
    spots: [curbs],
    warnings,
    outcomes,
    hashes,
  });
}

const ZERO = '0'.repeat(64);
const TEN_OFF = `3ff${'0'.repeat(61)}`;
const ELEVEN_OFF = `7ff${'0'.repeat(61)}`;

test('an extra-map photo within 10 bits of a kept main photo is a near-duplicate; 11 bits is kept', () => {
  const { collection, report } = mixedCurbs({
    mainHash: ZERO,
    balkanHashes: [TEN_OFF, ELEVEN_OFF],
  });
  assert.deepEqual(collection.features[0].properties.photos, [
    'spots/vienna/main.webp',
    'spots/vienna/balkan-2.webp',
  ]);
  assert.deepEqual(report.photosNearDuplicate, [
    {
      spotId: collection.features[0].properties.id,
      map: 'balkan',
      n: 1,
      sameAs: { map: 'vienna', n: 1 },
      distance: 10,
    },
  ]);
});

test('photos of the same map are never near-duplicates of each other', () => {
  const { report } = mixedCurbs({
    mainHash: ELEVEN_OFF,
    balkanHashes: [ZERO, ZERO],
  });
  assert.deepEqual(report.photosNearDuplicate, []);
});

test('an extra-map photo that is the same file as a kept photo is an exact duplicate', () => {
  const { spots, warnings } = prepareSpots(
    [{ ...PLACEMARKS[0], mediaUrls: [MYMAPS_A] }],
    PREFIXES,
    'vienna',
  );
  const [curbs] = mergeExtraMatches(spots, 'balkan', [
    balkanMatch(spots[0], { ordinal: 3, mediaUrls: [BALKAN_A] }),
  ]);
  const outcomes = new Map([
    [photoKey(curbs.id, 'vienna', 1), { written: true, file: 'same.webp' }],
    [photoKey(curbs.id, 'balkan', 1), { written: true, file: 'same.webp' }],
  ]);
  const { report } = buildCity({
    city: 'vienna',
    map: 'vienna',
    mid: 'MID',
    spots: [curbs],
    warnings,
    outcomes,
  });
  assert.deepEqual(report.photosDuplicate, [
    { spotId: curbs.id, map: 'balkan', n: 1, sameAs: { map: 'vienna', n: 1 } },
  ]);
  assert.equal(report.photosWritten, 1);
});

test('dead main photos are recovered up to the number of extra photos the spot kept', () => {
  const { spots, warnings } = prepareSpots(
    PLACEMARKS.slice(0, 1),
    PREFIXES,
    'vienna',
  );
  const [curbs] = mergeExtraMatches(spots, 'balkan', [
    balkanMatch(spots[0], { ordinal: 3, mediaUrls: [BALKAN_A] }),
  ]);
  const outcomes = new Map([
    [photoKey(curbs.id, 'vienna', 1), { dead: true, reason: 'http 403' }],
    [photoKey(curbs.id, 'vienna', 2), { dead: true, reason: 'http 404' }],
    [photoKey(curbs.id, 'balkan', 1), { written: true, file: 'b.webp' }],
  ]);
  const { report } = buildCity({
    city: 'vienna',
    map: 'vienna',
    mid: 'MID',
    spots: [curbs],
    warnings,
    outcomes,
  });
  assert.deepEqual(report.photosRecovered, [
    {
      spotId: curbs.id,
      map: 'vienna',
      n: 1,
      reason: 'http 403',
      from: ['balkan'],
    },
  ]);
  assert.deepEqual(report.photosDead, [
    { spotId: curbs.id, map: 'vienna', n: 2, reason: 'http 404' },
  ]);
});

test('with its only main photo dead, an extra photo has nothing to near-duplicate and recovers it', () => {
  const { report } = mixedCurbs({
    mainHash: ZERO,
    balkanHashes: [ZERO],
    mainDead: true,
  });
  assert.equal(report.photosRecovered.length, 1);
  assert.deepEqual(report.photosNearDuplicate, []);
});

test('a near-duplicate extra photo recovers nothing', () => {
  const { spots, warnings } = prepareSpots(
    PLACEMARKS.slice(0, 1),
    PREFIXES,
    'vienna',
  );
  const [curbs] = mergeExtraMatches(spots, 'balkan', [
    balkanMatch(spots[0], { ordinal: 3, mediaUrls: [BALKAN_A] }),
  ]);
  const outcomes = new Map([
    [photoKey(curbs.id, 'vienna', 1), { written: true, file: 'main.webp' }],
    [photoKey(curbs.id, 'vienna', 2), { dead: true, reason: 'http 404' }],
    [photoKey(curbs.id, 'balkan', 1), { written: true, file: 'b.webp' }],
  ]);
  const hashes = new Map([
    ['main.webp', ZERO],
    ['b.webp', ZERO],
  ]);
  const { report } = buildCity({
    city: 'vienna',
    map: 'vienna',
    mid: 'MID',
    spots: [curbs],
    warnings,
    outcomes,
    hashes,
  });
  assert.equal(report.photosNearDuplicate.length, 1);
  assert.deepEqual(report.photosRecovered, []);
  assert.deepEqual(report.photosDead, [
    { spotId: curbs.id, map: 'vienna', n: 2, reason: 'http 404' },
  ]);
});

test('link counts list every map, and per map only the spots with links', () => {
  const { report } = mixedCurbs({
    mainHash: ZERO,
    balkanHashes: [ELEVEN_OFF, ELEVEN_OFF],
  });
  const [spotId] = Object.keys(report.linkCounts.vienna);
  assert.deepEqual(report.linkCounts, {
    vienna: { [spotId]: 1 },
    balkan: { [spotId]: 2 },
  });
});

test('a written photo that needs comparing but has no hash is a bug', () => {
  assert.throws(
    () => mixedCurbs({ mainHash: undefined, balkanHashes: [ZERO] }),
    /no perceptual hash for main\.webp/,
  );
});

test('the report keeps the documented key order', () => {
  const { report } = vienna();
  assert.deepEqual(Object.keys(report), [
    'city',
    'map',
    'mid',
    'placemarks',
    'spotsWritten',
    'photosLinked',
    'photosWritten',
    'photosDead',
    'photosRecovered',
    'photosDuplicate',
    'photosNearDuplicate',
    'spotsWithoutPhotos',
    'statusCounts',
    'extraMaps',
    'matches',
    'linkCounts',
    'warnings',
  ]);
});

test('match results become report entries carrying the map and the full placemark record', () => {
  const { spots } = prepareSpots(PLACEMARKS, PREFIXES, 'vienna');
  const [curbs, gap] = spots;
  const far = {
    ordinal: 5,
    name: 'Wien: Curbs',
    styleUrl: '#icon-1899-0288D1',
    coordinates: [16.3, 48.1],
    mediaUrls: ['x'],
  };
  const tie = {
    ordinal: 6,
    name: 'Wien: Twin',
    styleUrl: '#icon-1899-0288D1',
    coordinates: [16.2, 48.2],
    mediaUrls: [],
    description: 'Notes',
  };
  const stray = {
    ordinal: 8,
    name: 'Wien: Stray',
    styleUrl: '#icon-1899-0288D1',
    coordinates: [17, 48],
    mediaUrls: [],
  };
  assert.deepEqual(
    reportMatchEntries('balkan', spots, {
      conflicts: [
        {
          spotId: curbs.id,
          placemark: far,
          name: 'Curbs',
          distanceM: 14_876.4,
          merged: true,
        },
      ],
      ambiguous: [
        { placemark: tie, name: 'Twin', candidates: [curbs.id, gap.id] },
      ],
      unmatched: [{ placemark: stray, name: 'Stray' }],
    }),
    {
      conflicts: [
        {
          map: 'balkan',
          spotId: curbs.id,
          ordinal: 5,
          name: 'Wien: Curbs',
          position: [16.3, 48.1],
          photoLinks: 1,
          distanceM: 14_876,
          merged: true,
          positions: { main: curbs.coordinates, extra: [16.3, 48.1] },
        },
      ],
      ambiguous: [
        {
          map: 'balkan',
          ordinal: 6,
          name: 'Wien: Twin',
          position: [16.2, 48.2],
          description: 'Notes',
          photoLinks: 0,
          candidates: [curbs.id, gap.id],
        },
      ],
      unmatched: [
        {
          map: 'balkan',
          ordinal: 8,
          name: 'Wien: Stray',
          position: [17, 48],
          photoLinks: 0,
        },
      ],
    },
  );
});

test('a URL anywhere in a spot fails the output check, naming the spot and field', () => {
  const { collection } = vienna();
  const id = collection.features[0].properties.id;
  collection.features[0].properties.sources = [
    { map: 'vienna' },
    { map: 'balkan', description: 'see https://maps.app.goo.gl/x' },
  ];
  assert.throws(
    () => assertNoUrls(collection),
    new RegExp(`spot ${id}: sources\\[1\\]\\.description carries a URL`),
  );
  collection.features[0].properties.sources = [
    { map: 'vienna', description: 'www.example.org' },
  ];
  assert.throws(() => assertNoUrls(collection), /sources\[0\]\.description/);
});

test('the word Google alone passes the output check', () => {
  const { collection } = vienna();
  collection.features[0].properties.sources = [
    { map: 'vienna', description: 'Google says closed' },
  ];
  assert.doesNotThrow(() => assertNoUrls(collection));
});
