import { IS_SELECTED } from './spot-layers';
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

/** Records every paint property the pulse sets, without being a map. */
class FakeMap implements LockOnMap {
  readonly calls: { layer: string; property: string; value: unknown }[] = [];

  setPaintProperty(layer: string, property: string, value: unknown): void {
    this.calls.push({ layer, property, value });
  }

  /** The last value set for one of the lock-on ring's properties. */
  latest(property: string): unknown {
    return [...this.calls]
      .reverse()
      .find(
        (call) => call.layer === 'spots-lock-on' && call.property === property,
      )?.value;
  }
}

/** The stroke opacity the pulse paints: `opacity` on the selected pin, nothing elsewhere. */
const strokeOpacity = (opacity: number) => ['case', IS_SELECTED, opacity, 0];

describe('startLockOn', () => {
  let clock: FrameClock;
  let map: FakeMap;

  beforeEach(() => {
    clock = new FrameClock();
    map = new FakeMap();
  });

  it('throws the ring out wide and at full strength the moment it starts', () => {
    startLockOn(map, { reducedMotion: false });
    expect(map.latest('circle-radius')).toBe(34);
    expect(map.latest('circle-stroke-opacity')).toEqual(strokeOpacity(1));
  });

  it('eases most of the way in, half faded, at half time', () => {
    startLockOn(map, { reducedMotion: false });
    clock.frame(1000);
    clock.frame(1000 + LOCK_ON_DURATION_MS / 2);
    // Cubic ease-out at t = 0.5 covers 87.5% of the way from 34 px to 11.5 px.
    expect(map.latest('circle-radius') as number).toBeCloseTo(14.3125, 4);
    expect(map.latest('circle-stroke-opacity')).toEqual(strokeOpacity(0.5));
  });

  it('comes to rest invisible on the amber ring and stops asking for frames', () => {
    startLockOn(map, { reducedMotion: false });
    clock.frame(1000);
    clock.frame(1000 + LOCK_ON_DURATION_MS);
    expect(map.latest('circle-radius')).toBe(11.5);
    expect(map.latest('circle-stroke-opacity')).toEqual(strokeOpacity(0));
    expect(clock.pending).toBe(0);
  });

  it('stops on cancel and puts the ring back to rest', () => {
    const cancel = startLockOn(map, { reducedMotion: false });
    clock.frame(1000);
    cancel();
    expect(clock.pending).withContext('the next frame was cancelled').toBe(0);
    expect(map.latest('circle-radius')).toBe(11.5);
    expect(map.latest('circle-stroke-opacity')).toEqual(strokeOpacity(0));
    const painted = map.calls.length;
    clock.frame(1100);
    expect(map.calls.length)
      .withContext('nothing painted after cancel')
      .toBe(painted);
  });

  it('paints nothing and asks for no frame under reduced motion', () => {
    const cancel = startLockOn(map, { reducedMotion: true });
    cancel();
    expect(map.calls).toEqual([]);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
