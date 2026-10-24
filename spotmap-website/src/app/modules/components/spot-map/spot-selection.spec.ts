import {
  FLAG_AT_REST_FILTER,
  flagFilter,
  LOCK_ON_AT_REST_FILTER,
  photoPinFilter,
} from './spot-layers';
import { SpotSelection } from './spot-selection';
import {
  FakeMap,
  holdAnimationFrames,
  LOCK_ON_AT_REST,
  onlySpot,
  requestReducedMotion,
} from './testing/fake-map';

describe('SpotSelection', () => {
  let fake: FakeMap;

  beforeEach(() => {
    fake = new FakeMap();
  });

  afterEach(() => fake.remove());

  /** The lock-on filters the selection set, in order. */
  const lockOnFilters = () =>
    fake.filterCalls.filter((call) => call.layer === 'spots-lock-on');

  it('starts with nothing selected', () => {
    expect(new SpotSelection(fake).selectedId).toBeNull();
  });

  it('marks the shown spot selected and locks on to it', () => {
    requestReducedMotion(false);
    holdAnimationFrames();
    const selection = new SpotSelection(fake);
    selection.show('a', { pulse: true });
    expect(selection.selectedId).toBe('a');
    expect(fake.featureStates['a']?.['selected']).toBe(true);
    expect(fake.lastLockOnFilter()).toEqual(onlySpot('a'));
  });

  it('shows a selection without the pulse when asked to', () => {
    requestReducedMotion(false);
    holdAnimationFrames();
    new SpotSelection(fake).show('a', { pulse: false });
    expect(fake.featureStates['a']?.['selected']).toBe(true);
    expect(lockOnFilters()).toEqual([]);
  });

  it('skips the pulse under reduced motion', () => {
    requestReducedMotion(true);
    new SpotSelection(fake).show('a', { pulse: true });
    expect(fake.featureStates['a']?.['selected']).toBe(true);
    expect(lockOnFilters()).toEqual([]);
  });

  it('moves the selection, clearing the old pin and stopping its pulse', () => {
    requestReducedMotion(false);
    const cancelFrame = holdAnimationFrames();
    const selection = new SpotSelection(fake);
    selection.show('a', { pulse: true });
    selection.show('b', { pulse: true });
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
    expect(fake.featureStates['b']?.['selected']).toBe(true);
    expect(cancelFrame).toHaveBeenCalled();
    expect(fake.lastLockOnFilter()).toEqual(onlySpot('b'));
  });

  it('clears the selection on null and puts the ring to rest', () => {
    requestReducedMotion(false);
    holdAnimationFrames();
    const selection = new SpotSelection(fake);
    selection.show('a', { pulse: true });
    selection.show(null, { pulse: true });
    expect(selection.selectedId).toBeNull();
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
    expect(fake.lastLockOnFilter()).toBe(LOCK_ON_AT_REST_FILTER);
    expect(fake.lastLockOnPaint('circle-stroke-opacity')).toBe(LOCK_ON_AT_REST);
  });

  it('does nothing when shown the spot it already shows', () => {
    requestReducedMotion(false);
    holdAnimationFrames();
    const selection = new SpotSelection(fake);
    selection.show('a', { pulse: true });
    const setState = spyOn(fake, 'setFeatureState').and.callThrough();
    const filters = lockOnFilters().length;
    selection.show('a', { pulse: true });
    expect(setState).not.toHaveBeenCalled();
    expect(lockOnFilters().length).toBe(filters);
  });

  it('stops the pulse on dispose and leaves the ring at rest', () => {
    requestReducedMotion(false);
    const cancelFrame = holdAnimationFrames();
    const selection = new SpotSelection(fake);
    selection.show('a', { pulse: true });
    selection.dispose();
    expect(cancelFrame).toHaveBeenCalled();
    expect(fake.lastLockOnFilter()).toBe(LOCK_ON_AT_REST_FILTER);
  });

  describe('with the photo layers on the map', () => {
    const flagFilters = () =>
      fake.filterCalls.filter((c) => c.layer === 'spots-flag');
    const photoFilters = () =>
      fake.filterCalls.filter((c) => c.layer === 'spots-photo');

    it('flies the flag over a selected spot with a photo, taking its photo pin away', () => {
      new SpotSelection(fake, { flag: true }).show('a', {
        pulse: false,
        hasCover: true,
      });
      expect(flagFilters().at(-1)?.filter).toEqual(flagFilter('a'));
      expect(photoFilters().at(-1)?.filter).toEqual(photoPinFilter('a'));
    });

    it('keeps the flag down for a selected spot with no photo', () => {
      new SpotSelection(fake, { flag: true }).show('a', {
        pulse: false,
        hasCover: false,
      });
      expect(flagFilters().at(-1)?.filter).toBe(FLAG_AT_REST_FILTER);
    });

    it('lowers the flag and gives the photo pin back when the selection clears', () => {
      const selection = new SpotSelection(fake, { flag: true });
      selection.show('a', { pulse: false, hasCover: true });
      selection.show(null, { pulse: false });
      expect(flagFilters().at(-1)?.filter).toBe(FLAG_AT_REST_FILTER);
      expect(photoFilters().at(-1)?.filter).toEqual(photoPinFilter(null));
    });

    it('never touches the photo layers when the map has none', () => {
      new SpotSelection(fake).show('a', { pulse: false, hasCover: true });
      expect(flagFilters()).toEqual([]);
      expect(photoFilters()).toEqual([]);
    });
  });
});
