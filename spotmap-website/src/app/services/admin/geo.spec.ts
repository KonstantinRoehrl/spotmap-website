import {
  distanceMeters,
  EARTH_RADIUS_M,
  NAME_MATCH_MAX_M,
  POSITION_MATCH_MAX_M,
} from './geo';

/** Hbf Curb, Vienna — the golden spot of spot-id.spec.ts. */
const HBF_CURB = { lng: 16.3785491, lat: 48.1840844 };

/**
 * Every expected distance below is what tools/extract-spots/match.mjs's `distanceMeters` returns
 * for the same pair as `[lng, lat]` arrays.
 */
describe('geo', () => {
  it('keeps the extractor’s constants', () => {
    expect(EARTH_RADIUS_M).toBe(6_371_000);
    expect(POSITION_MATCH_MAX_M).toBe(25);
    expect(NAME_MATCH_MAX_M).toBe(100);
  });

  describe('distanceMeters', () => {
    it('is 0 between a point and itself', () => {
      expect(distanceMeters(HBF_CURB, { ...HBF_CURB })).toBe(0);
    });

    it('measures a 0.0002° step north as about 22.24 m', () => {
      expect(
        distanceMeters(HBF_CURB, { lng: 16.3785491, lat: 48.1842844 }),
      ).toBeCloseTo(22.23898532885992, 9);
    });

    it('measures a 0.0003° step east as about 22.24 m at Vienna’s latitude', () => {
      expect(
        distanceMeters(HBF_CURB, { lng: 16.3788491, lat: 48.1840844 }),
      ).toBeCloseTo(22.241415691000032, 9);
    });

    it('measures two Barcelona spots about 1.99 km apart', () => {
      expect(
        distanceMeters(
          { lng: 2.2247261, lat: 41.4533376 },
          { lng: 2.2019649, lat: 41.4479578 },
        ),
      ).toBeCloseTo(1989.0835936362998, 9);
    });

    it('measures Vienna to Lisbon as about 2,300 km', () => {
      expect(
        distanceMeters(HBF_CURB, { lng: -9.1521139, lat: 38.7085027 }),
      ).toBeCloseTo(2299773.783553896, 6);
    });

    it('is symmetric', () => {
      const other = { lng: 16.3725, lat: 48.2082 };

      expect(distanceMeters(other, HBF_CURB)).toBe(
        distanceMeters(HBF_CURB, other),
      );
      expect(distanceMeters(HBF_CURB, other)).toBeCloseTo(
        2718.7580286303396,
        9,
      );
    });
  });
});
