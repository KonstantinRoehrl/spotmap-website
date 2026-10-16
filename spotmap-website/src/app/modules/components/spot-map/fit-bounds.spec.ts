import { framingBounds } from './fit-bounds';

/** Five spots in Belgrade and one in Novi Sad, ~68 km out — the shape the real dataset has. */
const BELGRADE_LIKE: [number, number][] = [
  [20.46, 44.81],
  [20.47, 44.82],
  [20.45, 44.8],
  [20.48, 44.81],
  [20.46, 44.83],
  [19.83, 45.25],
];

describe('framingBounds', () => {
  it('has nothing to frame for a city with no spots', () => {
    expect(framingBounds([])).toBeNull();
  });

  it('frames a lone spot as a point', () => {
    expect(framingBounds([[16.37, 48.2]])).toEqual([
      [16.37, 48.2],
      [16.37, 48.2],
    ]);
  });

  it('is the tightest box around every spot of a compact city', () => {
    expect(
      framingBounds([
        [16.3, 48.15],
        [16.45, 48.25],
        [16.38, 48.2],
      ]),
    ).toEqual([
      [16.3, 48.15],
      [16.45, 48.25],
    ]);
  });

  it('leaves a spot far outside the city out of the frame', () => {
    expect(framingBounds(BELGRADE_LIKE)).toEqual([
      [20.45, 44.8],
      [20.48, 44.83],
    ]);
  });

  it('keeps a spread-out city whole while every spot is within the radius', () => {
    // ~21 km either side of the middle one: Linz-sized, and no outlier.
    const west: [number, number] = [14.0, 48.3];
    const middle: [number, number] = [14.3, 48.3];
    const east: [number, number] = [14.6, 48.3];
    expect(framingBounds([west, middle, east])).toEqual([west, east]);
  });

  it('keeps every spot when none is within the radius of the median', () => {
    // Two towns ~110 km apart: the median sits between them, so neither is "the city".
    const vienna: [number, number][] = [
      [16.37, 48.2],
      [16.38, 48.21],
    ];
    const linz: [number, number][] = [
      [14.3, 48.3],
      [14.31, 48.31],
    ];
    expect(framingBounds([...vienna, ...linz])).toEqual([
      [14.3, 48.2],
      [16.38, 48.31],
    ]);
  });

  it('measures east-west distance at the spots’ own latitude', () => {
    const town: [number, number][] = [
      [16.37, 48.2],
      [16.37, 48.2],
      [16.37, 48.2],
    ];
    // 0.35° of longitude is ~26 km at 48°N — inside the radius — but ~39 km on the equator's scale.
    expect(framingBounds([...town, [16.72, 48.2]])).toEqual([
      [16.37, 48.2],
      [16.72, 48.2],
    ]);
    // 0.5° is ~37 km at 48°N.
    expect(framingBounds([...town, [16.87, 48.2]])).toEqual([
      [16.37, 48.2],
      [16.37, 48.2],
    ]);
  });
});
