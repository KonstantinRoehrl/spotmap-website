import { LOCK_ON_AT_REST_FILTER } from './spot-layers';
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

  it('leaves the photo pins to the selection flag', () => {
    const selection = new SpotSelection(fake);
    selection.show('a', { pulse: false });
    selection.show(null, { pulse: false });
    expect(
      fake.filterCalls.filter((call) => call.layer === 'spots-photo'),
    ).toEqual([]);
  });
});
