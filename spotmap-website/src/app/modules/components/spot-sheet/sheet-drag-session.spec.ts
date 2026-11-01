import { SheetDrag } from './sheet-drag-session';

describe('SheetDrag', () => {
  const stops = { peek: 64, half: 340, full: 784 };

  /** A drag on an element rendered `height` px tall, recording what it reports. */
  function start(height: number) {
    const host = document.createElement('div');
    spyOn(host, 'getBoundingClientRect').and.returnValue(
      new DOMRect(0, 0, 100, height),
    );
    const settled: string[] = [];
    const drag = new SheetDrag(host, () => stops, {
      started: () => undefined,
      settled: (stop) => settled.push(stop),
      release: (clear) => clear(),
    });
    return { host, drag, settled };
  }

  it('picks up from the rendered height, so a press during a settle does not jump', () => {
    const { host, drag } = start(500);
    drag.begin(200);
    expect(host.style.getPropertyValue('--sheet-drag-height')).toBe('500px');
  });

  it('clamps to the sheet’s travel and writes the rise', () => {
    const { host, drag } = start(340);
    drag.begin(500);
    drag.move(-900, 10);
    expect(host.style.getPropertyValue('--sheet-drag-height')).toBe('784px');
    expect(host.style.getPropertyValue('--sheet-drag-rise')).toBe('1');
    drag.move(1500, 20);
    expect(host.style.getPropertyValue('--sheet-drag-height')).toBe('64px');
    expect(host.style.getPropertyValue('--sheet-drag-rise')).toBe('0');
  });

  it('flicks one height from where the finger is', () => {
    const { drag, settled } = start(784);
    drag.begin(100);
    drag.move(120, 10);
    drag.move(160, 50);
    drag.end(50, false);
    expect(settled).toEqual(['half']);
  });

  it('drops the speed of a cancelled drag', () => {
    const { drag, settled } = start(784);
    drag.begin(100);
    drag.move(120, 10);
    drag.move(160, 50);
    drag.end(50, true);
    expect(settled).toEqual(['full']);
  });
});
