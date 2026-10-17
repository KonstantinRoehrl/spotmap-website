import {
  INITIAL_MAP_LOAD_STATE,
  lockedLetterCount,
  MapLoadEvent,
  MapLoadProgress,
} from './map-load-progress';

/** Applies events in order and returns the last state. */
function run(...events: MapLoadEvent[]) {
  const progress = new MapLoadProgress();
  for (const event of events) {
    progress.apply(event);
  }
  return progress.state;
}

describe('MapLoadProgress', () => {
  it('starts at zero on the spots step', () => {
    expect(new MapLoadProgress().state).toEqual(INITIAL_MAP_LOAD_STATE);
    expect(INITIAL_MAP_LOAD_STATE).toEqual({
      step: 'spots',
      progress: 0,
      fallback: false,
    });
  });

  it('moves through the spots segment on its milestones', () => {
    expect(run({ kind: 'spots-sent' }).progress).toBeCloseTo(0.045, 6);
    expect(
      run({ kind: 'spots-sent' }, { kind: 'spots-headers' }).progress,
    ).toBeCloseTo(0.18, 6);
    expect(run({ kind: 'spots-done' })).toEqual({
      step: 'map',
      progress: 0.3,
      fallback: false,
    });
  });

  it('continues the snapshot in what is left of the segment, never resetting', () => {
    const state = run(
      { kind: 'spots-sent' },
      { kind: 'spots-headers' },
      { kind: 'spots-fallback' },
      { kind: 'spots-sent' },
    );
    expect(state.fallback).toBeTrue();
    expect(state.step).toBe('spots');
    expect(state.progress).toBeCloseTo(0.18 + 0.12 * 0.15, 6);
    expect(
      run(
        { kind: 'spots-sent' },
        { kind: 'spots-headers' },
        { kind: 'spots-fallback' },
      ).progress,
    ).toBeCloseTo(0.18, 6);
  });

  it('maps the renderer, the style and the tiles inside the map segment', () => {
    expect(
      run({ kind: 'spots-done' }, { kind: 'renderer-ready' }).progress,
    ).toBeCloseTo(0.38, 6);
    expect(
      run({ kind: 'spots-done' }, { kind: 'style-loaded' }).progress,
    ).toBeCloseTo(0.46, 6);
    expect(
      run(
        { kind: 'spots-done' },
        { kind: 'style-loaded' },
        { kind: 'tiles', loaded: 5, requested: 10 },
      ).progress,
    ).toBeCloseTo(0.66, 6);
  });

  it('never goes back when the tile denominator grows', () => {
    const state = run(
      { kind: 'spots-done' },
      { kind: 'tiles', loaded: 5, requested: 10 },
      { kind: 'tiles', loaded: 5, requested: 20 },
    );
    expect(state.progress).toBeCloseTo(0.66, 6);
  });

  it('caps the tiles below the paint, even with every tile in', () => {
    expect(
      run({ kind: 'tiles', loaded: 12, requested: 10 }).progress,
    ).toBeCloseTo(0.86, 6);
    // Nothing requested yet counts as no tile progress past the style's own mark.
    expect(
      run({ kind: 'tiles', loaded: 0, requested: 0 }).progress,
    ).toBeCloseTo(0.46, 6);
  });

  it('reaches 90 % on the paint and 100 % once the pins are drawn', () => {
    expect(run({ kind: 'painted' })).toEqual({
      step: 'draw',
      progress: 0.9,
      fallback: false,
    });
    expect(run({ kind: 'painted' }, { kind: 'pins-drawn' })).toEqual({
      step: 'done',
      progress: 1,
      fallback: false,
    });
  });

  it('ignores a late event from an earlier step', () => {
    expect(run({ kind: 'painted' }, { kind: 'spots-sent' })).toEqual({
      step: 'draw',
      progress: 0.9,
      fallback: false,
    });
  });

  it('returns the new state from apply', () => {
    const progress = new MapLoadProgress();
    expect(progress.apply({ kind: 'painted' })).toBe(progress.state);
  });
});

describe('lockedLetterCount', () => {
  it('locks a four-letter name left to right and spells it out at 90 %', () => {
    expect(lockedLetterCount('GRAZ', 0)).toBe(0);
    expect(lockedLetterCount('GRAZ', 0.45)).toBe(2);
    expect(lockedLetterCount('GRAZ', 0.9)).toBe(4);
    expect(lockedLetterCount('GRAZ', 1)).toBe(4);
  });

  it('locks a nine-letter name without losing a letter to float error', () => {
    expect(lockedLetterCount('BARCELONA', 0.3)).toBe(3);
    expect(lockedLetterCount('BARCELONA', 0.6)).toBe(6);
    expect(lockedLetterCount('BARCELONA', 0.89)).toBe(8);
  });
});
