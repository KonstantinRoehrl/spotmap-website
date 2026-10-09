import { LOCK_ON_AT_REST_FILTER } from './spot-layers';
import {
  LOCK_ON_DURATION_MS,
  type LockOnMap,
  startLockOn,
} from './lock-on-pulse';

/** A `requestAnimationFrame` the spec advances by hand, one frame at a time. */
class FrameClock {
  private readonly queued = new Map<number, FrameRequestCallback>();
  private nextId = 1;

  constructor() {
    spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      const id = this.nextId++;
      this.queued.set(id, callback);
      return id;
    });
    spyOn(window, 'cancelAnimationFrame').and.callFake((id) => {
      this.queued.delete(id);
    });
  }

  /** How many frames are waiting to run. */
  get pending(): number {
    return this.queued.size;
  }

  /** Runs every frame queued so far, stamped with this time. */
  frame(now: number): void {
    const due = [...this.queued.values()];
    this.queued.clear();
    for (const callback of due) callback(now);
  }
}

/** Records every paint property and filter the pulse sets, without being a map. */
class FakeMap implements LockOnMap {
  readonly calls: { layer: string; property: string; value: unknown }[] = [];
  readonly filters: { layer: string; filter: unknown }[] = [];

  setPaintProperty(layer: string, property: string, value: unknown): void {
    this.calls.push({ layer, property, value });
  }

  setFilter(layer: string, filter: unknown): void {
    this.filters.push({ layer, filter });
  }

  /** The last value set for one of the lock-on ring's properties. */
  latest(property: string): unknown {
    return [...this.calls]
      .reverse()
      .find(
        (call) => call.layer === 'spots-lock-on' && call.property === property,
      )?.value;
  }

  /** The last filter set on the lock-on ring. */
  latestFilter(): unknown {
    return [...this.filters]
      .reverse()
      .find((call) => call.layer === 'spots-lock-on')?.filter;
  }
}

/** The lock-on filter that picks out the one spot with this id. */
const onlySpot = (id: string) => ['==', ['get', 'id'], id];

describe('startLockOn', () => {
  let clock: FrameClock;
  let map: FakeMap;

  beforeEach(() => {
    clock = new FrameClock();
    map = new FakeMap();
  });

  it('throws the ring out wide and at full strength around the selected pin the moment it starts', () => {
    startLockOn(map, 'a', { reducedMotion: false });
    expect(map.latestFilter()).toEqual(onlySpot('a'));
    expect(map.latest('circle-radius')).toBe(34);
    expect(map.latest('circle-stroke-opacity')).toBe(1);
  });

  it('eases most of the way in, half faded, at half time', () => {
    startLockOn(map, 'a', { reducedMotion: false });
    clock.frame(1000);
    clock.frame(1000 + LOCK_ON_DURATION_MS / 2);
    // Cubic ease-out at t = 0.5 covers 87.5% of the way from 34 px to 11.5 px.
    expect(map.latest('circle-radius') as number).toBeCloseTo(14.3125, 4);
    expect(map.latest('circle-stroke-opacity')).toBe(0.5);
  });

  it('paints only constants per frame and picks the pin once, so no frame relayouts the spots', () => {
    startLockOn(map, 'a', { reducedMotion: false });
    for (const now of [1000, 1100, 1200, 1300]) clock.frame(now);
    expect(map.filters)
      .withContext('one filter for the whole run')
      .toEqual([{ layer: 'spots-lock-on', filter: onlySpot('a') }]);
    for (const call of map.calls) {
      expect(typeof call.value)
        .withContext(`${call.layer} ${call.property}`)
        .toBe('number');
    }
  });

  it('comes to rest invisible on the amber ring, matching no pin, and stops asking for frames', () => {
    startLockOn(map, 'a', { reducedMotion: false });
    clock.frame(1000);
    clock.frame(1000 + LOCK_ON_DURATION_MS);
    expect(map.latest('circle-radius')).toBe(11.5);
    expect(map.latest('circle-stroke-opacity')).toBe(0);
    expect(map.latestFilter()).toBe(LOCK_ON_AT_REST_FILTER);
    expect(clock.pending).toBe(0);
  });

  it('stops on cancel and puts the ring back to rest', () => {
    const cancel = startLockOn(map, 'a', { reducedMotion: false });
    clock.frame(1000);
    cancel();
    expect(clock.pending).withContext('the next frame was cancelled').toBe(0);
    expect(map.latest('circle-radius')).toBe(11.5);
    expect(map.latest('circle-stroke-opacity')).toBe(0);
    expect(map.latestFilter()).toBe(LOCK_ON_AT_REST_FILTER);
    const painted = map.calls.length;
    clock.frame(1100);
    expect(map.calls.length)
      .withContext('nothing painted after cancel')
      .toBe(painted);
  });

  it('paints nothing and asks for no frame under reduced motion', () => {
    const cancel = startLockOn(map, 'a', { reducedMotion: true });
    cancel();
    expect(map.calls).toEqual([]);
    expect(map.filters).toEqual([]);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
