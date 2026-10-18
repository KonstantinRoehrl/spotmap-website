import type { LngLat } from '../../../../models/admin/admin-spot';
import {
  distanceMeters,
  POSITION_MATCH_MAX_M,
} from '../../../../services/admin/geo';
import type { ProcessedPhoto } from '../../../../services/admin/photo-pipeline/photo-pipeline';
import {
  BATCH_SPREAD_WARN_M,
  batchSpreadM,
  firstGuess,
} from './create-or-attach.state';

/** A processed photo with only the fields the helpers read made meaningful. */
function photo(sourceName: string, gps: LngLat | null): ProcessedPhoto {
  return {
    sourceName,
    gps,
    full: new Blob(['full'], { type: 'image/webp' }),
    thumb: new Blob(['thumb'], { type: 'image/webp' }),
    hash8: '0badc0de',
    width: 1400,
    height: 1050,
  };
}

const A: LngLat = { lng: 16.3785491, lat: 48.1840844 };
/** 0.001° of latitude north of A: about 111.19 m on the 6,371 km sphere. */
const B: LngLat = { lng: 16.3785491, lat: 48.1850844 };
/** Between A and B. */
const MID: LngLat = { lng: 16.3785491, lat: 48.1845844 };

describe('create-or-attach state', () => {
  it('warns at the duplicate check radius', () => {
    expect(BATCH_SPREAD_WARN_M).toBe(POSITION_MATCH_MAX_M);
    expect(BATCH_SPREAD_WARN_M).toBe(25);
  });

  it('guesses from the first photo that has GPS', () => {
    expect(
      firstGuess([photo('a', null), photo('b', B), photo('c', A)]),
    ).toEqual(B);
  });

  it('has no guess when no photo has GPS', () => {
    expect(firstGuess([photo('a', null), photo('b', null)])).toBeNull();
    expect(firstGuess([])).toBeNull();
  });

  it('measures no spread below two GPS photos', () => {
    expect(batchSpreadM([])).toBe(0);
    expect(batchSpreadM([photo('a', A), photo('b', null)])).toBe(0);
  });

  it('measures the largest pairwise distance, ignoring photos without GPS', () => {
    const spread = batchSpreadM([
      photo('a', MID),
      photo('b', A),
      photo('c', null),
      photo('d', B),
    ]);
    expect(spread).toBe(distanceMeters(A, B));
    expect(spread).toBeCloseTo(111.19, 1);
  });
});
