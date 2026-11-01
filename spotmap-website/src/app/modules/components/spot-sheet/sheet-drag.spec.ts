import {
  clampHeight,
  decideBodyTouch,
  findScroller,
  releaseVelocity,
  riseAt,
  settleStop,
} from './sheet-drag';

const STOPS = { peek: 64, half: 340, full: 784 };

describe('sheet drag rules', () => {
  describe('releaseVelocity', () => {
    it('measures over the last 100 ms, upward positive', () => {
      const samples = [
        { y: 500, t: 0 },
        { y: 400, t: 100 },
        { y: 380, t: 150 },
        { y: 360, t: 200 },
      ];
      expect(releaseVelocity(samples, 200)).toBeCloseTo(0.4, 5);
    });

    it('reads downward as negative', () => {
      const samples = [
        { y: 100, t: 0 },
        { y: 160, t: 60 },
      ];
      expect(releaseVelocity(samples, 60)).toBeCloseTo(-1, 5);
    });

    it('is 0 when the finger paused for more than 80 ms', () => {
      const samples = [
        { y: 500, t: 0 },
        { y: 400, t: 50 },
      ];
      expect(releaseVelocity(samples, 131)).toBe(0);
    });

    it('is 0 with fewer than two samples in reach', () => {
      expect(releaseVelocity([], 10)).toBe(0);
      expect(releaseVelocity([{ y: 1, t: 10 }], 10)).toBe(0);
    });
  });

  describe('settleStop', () => {
    it('settles a slow release on the nearest height', () => {
      expect(settleStop(600, 0, STOPS)).toBe('full');
      expect(settleStop(500, 0.49, STOPS)).toBe('half');
      expect(settleStop(150, -0.49, STOPS)).toBe('peek');
    });

    it('moves a flick one height from where the sheet is now', () => {
      expect(settleStop(780, -0.5, STOPS)).toBe('half');
      expect(settleStop(345, 0.5, STOPS)).toBe('full');
      expect(settleStop(335, -3, STOPS)).toBe('peek');
      expect(settleStop(70, 3, STOPS)).toBe('half');
    });

    it('stays at the ends', () => {
      expect(settleStop(784, 5, STOPS)).toBe('full');
      expect(settleStop(64, -5, STOPS)).toBe('peek');
    });
  });

  it('clamps between peek and full, with no rubber-banding', () => {
    expect(clampHeight(10, STOPS)).toBe(64);
    expect(clampHeight(900, STOPS)).toBe(784);
    expect(clampHeight(500, STOPS)).toBe(500);
  });

  it('rises from 0 at half and below to 1 at full', () => {
    expect(riseAt(64, STOPS)).toBe(0);
    expect(riseAt(340, STOPS)).toBe(0);
    expect(riseAt(562, STOPS)).toBeCloseTo(0.5, 5);
    expect(riseAt(784, STOPS)).toBe(1);
  });

  it('never divides by nothing when half and full coincide', () => {
    expect(riseAt(340, { peek: 64, half: 340, full: 340 })).toBe(0);
  });

  describe('decideBodyTouch', () => {
    const decide = (dx: number, dy: number, full: boolean, atTop: boolean) =>
      decideBodyTouch({ dx, dy, full, atTop });

    it('waits for a touch that has not moved', () => {
      expect(decide(0, 0, false, true)).toBe('undecided');
    });

    it('leaves a mostly horizontal move to the photo rail', () => {
      expect(decide(10, 4, false, true)).toBe('none');
    });

    it('takes a swipe up unless the sheet is full', () => {
      expect(decide(0, -5, false, false)).toBe('sheet');
      expect(decide(0, -5, true, true)).toBe('scroll');
    });

    it('takes a swipe down only with the scroller at its top', () => {
      expect(decide(0, 5, true, true)).toBe('sheet');
      expect(decide(0, 5, false, false)).toBe('scroll');
    });
  });

  describe('findScroller', () => {
    let boundary: HTMLElement;

    beforeEach(() => {
      boundary = document.createElement('div');
      boundary.innerHTML = `
        <div class="pane" style="overflow-y:auto;height:50px">
          <div style="height:500px">
            <div class="rail" style="overflow-x:auto;height:20px"><i class="photo"></i></div>
          </div>
        </div>`;
      document.body.appendChild(boundary);
    });

    afterEach(() => boundary.remove());

    it('passes over a horizontal rail, whose computed overflow-y is auto too', () => {
      expect(findScroller(boundary.querySelector('.photo')!, boundary)).toBe(
        boundary.querySelector('.pane'),
      );
    });

    it('finds nothing when no ancestor inside the boundary overflows', () => {
      const pane = boundary.querySelector<HTMLElement>('.pane')!;
      pane.style.height = '1000px';
      expect(
        findScroller(boundary.querySelector('.photo')!, boundary),
      ).toBeNull();
    });
  });
});
