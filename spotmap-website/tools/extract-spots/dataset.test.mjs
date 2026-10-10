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

/** A previous run in the legacy shape (no `linkCounts`, map-less entries): GeoJSON and report. */
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

/**
 * A previous run in the current shape: GeoJSON photo files per spot, plus report lists. A spot's
 * source records default to the main map's alone.
 */
function previousCurrent({
  files,
  linkCounts,
  photosDead = [],
  photosRecovered = [],
  sources = {},
}) {
  return {
    previousCollection: {
      type: 'FeatureCollection',
      features: Object.entries(files).map(([id, photos]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [16.1, 48.1] },
        properties: {
          id,
          name: id,
          status: 'active',
          photos,
          sources: sources[id] ?? [{ map: 'vienna' }],
        },
      })),
    },
    previousReport: {
      photosDead,
      photosRecovered,
      photosDuplicate: [],
      linkCounts,
    },
  };
}

/**
 * A new run's GeoJSON photo files per spot and report, keeping only what the guard reads. A spot's
 * source records default to the main map's alone; `linkCounts` and match lists to none.
 */
function current({
  files,
  photosDead = [],
  photosRecovered = [],
  ambiguous = [],
  conflicts = [],
  unmatched = [],
  sources = {},
  linkCounts = {},
}) {
  return {
    collection: {
      type: 'FeatureCollection',
      features: Object.entries(files).map(([id, photos]) => ({
        properties: { id, photos, sources: sources[id] ?? [{ map: 'vienna' }] },
      })),
    },
    report: {
      map: 'vienna',
      photosDead,
      photosRecovered,
      matches: { conflicts, ambiguous, unmatched },
      linkCounts,
    },
  };
}

/** The spot every guard case is about. */
const S = 'curbs-abc123';
/** A dead entry of {@link S}'s photo `n` on `map`. */
const dead = (map, n) => ({ spotId: S, map, n, reason: 'http 403' });
/** The guard's answer when nothing must be refused. */
const NONE = { newlyDead: [], lostMatches: [] };

test('without previous outputs nothing is newly dead', () => {
  assert.deepEqual(
    findNewlyDeadPhotos(
      current({ files: { [S]: [] }, photosDead: [dead('vienna', 1)] }),
    ),
    NONE,
  );
});

test('a photo written last run that now comes back dead is newly dead', () => {
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['a.webp', 'b.webp'] },
      linkCounts: { vienna: { [S]: 2 } },
    }),
    ...current({ files: { [S]: ['a.webp'] }, photosDead: [dead('vienna', 2)] }),
  });
  assert.deepEqual(result, { newlyDead: [dead('vienna', 2)], lostMatches: [] });
});

test('a recovered photo that was written last run counts as newly dead unless its file is still there', () => {
  const previous = previousCurrent({
    files: { [S]: ['a.webp'] },
    linkCounts: { vienna: { [S]: 1 } },
  });
  const recovered = { ...dead('vienna', 1), from: ['balkan'] };
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({ files: { [S]: ['b.webp'] }, photosRecovered: [recovered] }),
    }),
    { newlyDead: [dead('vienna', 1)], lostMatches: [] },
  );
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({
        files: { [S]: ['a.webp', 'b.webp'] },
        photosRecovered: [recovered],
      }),
    }),
    NONE,
  );
});

test('a photo already dead or recovered last run is not newly dead', () => {
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['a.webp'] },
      linkCounts: { vienna: { [S]: 3 } },
      photosDead: [dead('vienna', 2)],
      photosRecovered: [{ ...dead('vienna', 3), from: ['balkan'] }],
    }),
    ...current({
      files: { [S]: [] },
      photosDead: [dead('vienna', 2), dead('vienna', 3)],
    }),
  });
  assert.deepEqual(result, NONE);
});

test('a number beyond last run’s link count is a new link, not newly dead', () => {
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['a.webp'] },
      linkCounts: { vienna: { [S]: 1 }, balkan: { [S]: 1 } },
    }),
    ...current({
      files: { [S]: [] },
      photosDead: [dead('vienna', 2), dead('balkan', 2)],
      sources: { [S]: [{ map: 'vienna' }, { map: 'balkan' }] },
    }),
  });
  assert.deepEqual(result, NONE);
});

test('an ambiguous or unmerged-conflict placemark naming a spot that map fed last run is a lost match', () => {
  const previous = previousCurrent({
    files: { [S]: ['b.webp'] },
    linkCounts: { vienna: {}, balkan: { [S]: 2 } },
  });
  const ambiguous = [
    {
      map: 'balkan',
      ordinal: 4,
      name: 'Wien: Curbs',
      candidates: [S, 'other-ffffff'],
    },
  ];
  const conflicts = [
    { map: 'balkan', spotId: S, ordinal: 5, name: 'Curbs', merged: false },
  ];
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({ files: { [S]: [] }, ambiguous }),
    }),
    {
      newlyDead: [],
      lostMatches: [
        { map: 'balkan', spotId: S, ordinal: 4, name: 'Wien: Curbs' },
      ],
    },
  );
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({ files: { [S]: [] }, conflicts }),
    }),
    {
      newlyDead: [],
      lostMatches: [{ map: 'balkan', spotId: S, ordinal: 5, name: 'Curbs' }],
    },
  );
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({
        files: { [S]: [] },
        conflicts: [{ ...conflicts[0], merged: true }],
        sources: { [S]: [{ map: 'vienna' }, { map: 'balkan' }] },
      }),
    }),
    NONE,
  );
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({ files: { [S]: ['b.webp'] }, ambiguous }),
    }),
    NONE,
  );
});

test('a spot an extra map fed last run that no placemark of that map matches now is a lost match while that map has unmatched placemarks', () => {
  // E.g. the feeding placemark was renamed and moved upstream and now lands in `unmatched`.
  const previous = previousCurrent({
    files: { [S]: ['a.webp', 'b.webp'] },
    linkCounts: { vienna: { [S]: 1 }, balkan: { [S]: 1 } },
    sources: {
      [S]: [{ map: 'vienna' }, { map: 'balkan', name: 'Rooftop Miniramp' }],
    },
  });
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({
        files: { [S]: ['a.webp'] },
        unmatched: [{ map: 'balkan', ordinal: 7, name: 'Sarajevo: Rooftop' }],
      }),
    }),
    {
      newlyDead: [],
      lostMatches: [{ map: 'balkan', spotId: S, name: 'Rooftop Miniramp' }],
    },
  );
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({
        files: { [S]: ['a.webp'] },
        unmatched: [{ map: 'other', ordinal: 7, name: 'Sarajevo: Rooftop' }],
      }),
    }),
    NONE,
  );
});

test('a spot whose only feeding placemark was deleted, with nothing of that map unmatched, is no lost match', () => {
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['a.webp', 'b.webp'] },
      linkCounts: { vienna: { [S]: 1 }, balkan: { [S]: 1 } },
      sources: { [S]: [{ map: 'vienna' }, { map: 'balkan' }] },
    }),
    ...current({ files: { [S]: ['a.webp'] } }),
  });
  assert.deepEqual(result, NONE);
});

test('a spot an extra map fed last run is no lost match when it still has a match, kept every file, or left the main map', () => {
  const previous = previousCurrent({
    files: { [S]: ['a.webp', 'b.webp', 'c.webp'] },
    linkCounts: { vienna: { [S]: 1 }, balkan: { [S]: 2 } },
    sources: {
      [S]: [{ map: 'vienna' }, { map: 'balkan' }, { map: 'balkan' }],
    },
  });
  // Something of that map is unmatched in every case, so only the spot's own state excuses it.
  const unmatched = [{ map: 'balkan', ordinal: 7, name: 'Wien: Elsewhere' }];
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({
        files: { [S]: ['a.webp', 'c.webp'] },
        sources: { [S]: [{ map: 'vienna' }, { map: 'balkan' }] },
        unmatched,
      }),
    }),
    NONE,
  );
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({ files: { [S]: ['a.webp', 'b.webp', 'c.webp'] }, unmatched }),
    }),
    NONE,
  );
  assert.deepEqual(
    findNewlyDeadPhotos({
      ...previous,
      ...current({ files: { 'other-ffffff': [] }, unmatched }),
    }),
    NONE,
  );
});

test('a spot named by an ambiguous placemark and matched by none is listed once, by that placemark', () => {
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['b.webp'] },
      linkCounts: { vienna: {}, balkan: { [S]: 1 } },
    }),
    ...current({
      files: { [S]: [] },
      ambiguous: [
        { map: 'balkan', ordinal: 4, name: 'Curbs', candidates: [S] },
      ],
    }),
  });
  assert.deepEqual(result, {
    newlyDead: [],
    lostMatches: [{ map: 'balkan', spotId: S, ordinal: 4, name: 'Curbs' }],
  });
});

test('a still-dead photo renumbered by an earlier link’s removal is not newly dead', () => {
  // Last run: placemark P1 linked balkan#1 and #2 (written), P2 linked #3 (dead). P1 is deleted
  // upstream, so P2's dead photo is now balkan#1.
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['a.webp', 'b.webp'] },
      linkCounts: { vienna: {}, balkan: { [S]: 3 } },
      photosDead: [dead('balkan', 3)],
      sources: {
        [S]: [{ map: 'vienna' }, { map: 'balkan' }, { map: 'balkan' }],
      },
    }),
    ...current({
      files: { [S]: [] },
      photosDead: [dead('balkan', 1)],
      sources: { [S]: [{ map: 'vienna' }, { map: 'balkan' }] },
      linkCounts: { balkan: { [S]: 1 } },
    }),
  });
  assert.deepEqual(result, NONE);
});

test('a written photo that dies as an earlier link is removed is still newly dead', () => {
  // Last run: balkan#1 and #2 written, #3 dead. Now #1 is removed and #2 dies: the dead #2 slides
  // to #1, the dead #3 to #2. Only one of them can be last run's dead #3.
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['a.webp', 'b.webp'] },
      linkCounts: { vienna: {}, balkan: { [S]: 3 } },
      photosDead: [dead('balkan', 3)],
      sources: { [S]: [{ map: 'vienna' }, { map: 'balkan' }] },
    }),
    ...current({
      files: { [S]: [] },
      photosDead: [dead('balkan', 1), dead('balkan', 2)],
      sources: { [S]: [{ map: 'vienna' }, { map: 'balkan' }] },
      linkCounts: { balkan: { [S]: 2 } },
    }),
  });
  assert.deepEqual(result, { newlyDead: [dead('balkan', 1)], lostMatches: [] });
});

test('a still-dead photo renumbered by a removal and an addition is not newly dead', () => {
  // Last run: a, b written, #3 dead. Now a is removed and c appended: b is #1, the dead one #2.
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['a.webp', 'b.webp'] },
      linkCounts: { vienna: { [S]: 3 } },
      photosDead: [dead('vienna', 3)],
    }),
    ...current({
      files: { [S]: ['b.webp', 'c.webp'] },
      photosDead: [dead('vienna', 2)],
      linkCounts: { vienna: { [S]: 3 } },
    }),
  });
  assert.deepEqual(result, NONE);
});

test('a written photo that dies while a link is swapped is still newly dead, and named', () => {
  // Last run: a, b, d written, #4 dead. Now a is removed, c appended and b dies:
  // b (now #1) is newly dead; the still-dead photo, now #3, is not.
  const result = findNewlyDeadPhotos({
    ...previousCurrent({
      files: { [S]: ['a.webp', 'b.webp', 'd.webp'] },
      linkCounts: { vienna: { [S]: 4 } },
      photosDead: [dead('vienna', 4)],
    }),
    ...current({
      files: { [S]: ['d.webp', 'c.webp'] },
      photosDead: [dead('vienna', 1), dead('vienna', 3)],
      linkCounts: { vienna: { [S]: 4 } },
    }),
  });
  assert.deepEqual(result, { newlyDead: [dead('vienna', 1)], lostMatches: [] });
});

test('the photo named newly dead is the one that was written last run', () => {
  const run = ({ before, after }) =>
    findNewlyDeadPhotos({
      ...previousCurrent({
        files: { [S]: before.files },
        linkCounts: { vienna: { [S]: before.count } },
        photosDead: before.dead.map((n) => dead('vienna', n)),
      }),
      ...current({
        files: { [S]: after.files },
        photosDead: after.dead.map((n) => dead('vienna', n)),
        linkCounts: { vienna: { [S]: after.count } },
      }),
    }).newlyDead;
  // a, b (dead), c: c is removed and a dies. Nothing tells this from "a removed, c dies", so the
  // pairing that moves photos least wins: a (#1) is named, not the already-dead b (#2).
  assert.deepEqual(
    run({
      before: { files: ['a.webp', 'c.webp'], count: 3, dead: [2] },
      after: { files: [], count: 2, dead: [1, 2] },
    }),
    [dead('vienna', 1)],
  );
  // a, b (dead), c, d: d is removed and a dies. c still sits at #3, so a must be #1.
  assert.deepEqual(
    run({
      before: { files: ['a.webp', 'c.webp', 'd.webp'], count: 4, dead: [2] },
      after: { files: ['c.webp'], count: 3, dead: [1, 2] },
    }),
    [dead('vienna', 1)],
  );
  // a, b, X (dead), e: a is removed, c appended and e dies. b moved down one, so X is #2 and e #3.
  assert.deepEqual(
    run({
      before: { files: ['a.webp', 'b.webp', 'e.webp'], count: 4, dead: [3] },
      after: { files: ['b.webp', 'c.webp'], count: 4, dead: [2, 3] },
    }),
    [dead('vienna', 3)],
  );
});

test('legacy: map-less dead entries match this run’s main-map entries by index', () => {
  const result = findNewlyDeadPhotos({
    ...previousRun({
      photoCounts: { [S]: 1 },
      photosDead: [{ spotId: S, index: 2, reason: 'http 403' }],
    }),
    ...current({
      files: { [S]: ['new.webp'] },
      photosRecovered: [{ ...dead('vienna', 2), from: ['balkan'] }],
      photosDead: [dead('balkan', 1)],
    }),
  });
  assert.deepEqual(result, NONE);
});

test('legacy: a main-map photo written last run that now comes back dead is still caught', () => {
  const result = findNewlyDeadPhotos({
    ...previousRun({ photoCounts: { [S]: 1 } }),
    ...current({ files: { [S]: [] }, photosDead: [dead('vienna', 1)] }),
  });
  assert.deepEqual(result, { newlyDead: [dead('vienna', 1)], lostMatches: [] });
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
