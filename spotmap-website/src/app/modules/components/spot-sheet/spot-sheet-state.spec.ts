import {
  INITIAL_SHEET,
  nextSheet,
  SHEET_OPEN_FRACTION,
  SHEET_PEEK_HEIGHT_PX,
  SheetEvent,
  SheetModel,
  sheetHeight,
  sheetStopOf,
  sheetStops,
  stopAbove,
  stopAfterHandleTap,
  stopBelow,
} from './spot-sheet-state';

/** Shorthand for a model. */
const at = (
  state: SheetModel['state'],
  resting: SheetModel['resting'],
  full = false,
): SheetModel => ({ state, resting, full });

describe('sheet state', () => {
  it('starts at peek', () => {
    expect(INITIAL_SHEET).toEqual(at('peek', 'peek'));
  });

  // [from, event, to]: every rule of the sheet, tapping only.
  const table: [SheetModel, SheetEvent, SheetModel][] = [
    [at('peek', 'peek'), 'head', at('list', 'list')],
    [at('list', 'list'), 'head', at('peek', 'peek')],
    [at('detail', 'list'), 'head', at('detail', 'list')],
    [at('peek', 'peek'), 'opened', at('detail', 'peek')],
    [at('list', 'list'), 'opened', at('detail', 'list')],
    [at('detail', 'list'), 'opened', at('detail', 'list')],
    [at('detail', 'peek'), 'back', at('list', 'list')],
    [at('list', 'list'), 'back', at('list', 'list')],
    [at('detail', 'list'), 'close', at('peek', 'peek')],
    [at('peek', 'peek'), 'close', at('peek', 'peek')],
    [at('detail', 'list'), 'closed-elsewhere', at('list', 'list')],
    [at('detail', 'peek'), 'closed-elsewhere', at('peek', 'peek')],
    [at('list', 'list'), 'closed-elsewhere', at('list', 'list')],
    [at('detail', 'list'), 'map-tap', at('peek', 'peek')],
    [at('list', 'list'), 'map-tap', at('list', 'list')],
    [at('peek', 'peek'), 'map-tap', at('peek', 'peek')],
    [at('peek', 'peek'), 'not-found', at('list', 'list')],
    [at('detail', 'peek'), 'not-found', at('list', 'list')],
    [at('list', 'list', true), 'head', at('peek', 'peek')],
    [at('detail', 'list', true), 'head', at('detail', 'list', true)],
    [at('list', 'list', true), 'opened', at('detail', 'list', true)],
    [at('detail', 'peek'), 'opened', at('detail', 'peek')],
    [at('detail', 'list', true), 'back', at('list', 'list', true)],
    [at('detail', 'list', true), 'close', at('peek', 'peek')],
    [at('detail', 'list', true), 'map-tap', at('peek', 'peek')],
    [at('detail', 'list', true), 'closed-elsewhere', at('list', 'list', true)],
    [at('detail', 'peek', true), 'closed-elsewhere', at('peek', 'peek')],
    [at('list', 'list', true), 'not-found', at('list', 'list')],
    [at('list', 'list'), 'settled-peek', at('peek', 'peek')],
    [at('detail', 'list', true), 'settled-peek', at('peek', 'peek')],
    [at('peek', 'peek'), 'settled-half', at('list', 'list')],
    [at('peek', 'peek'), 'settled-full', at('list', 'list', true)],
    [at('list', 'list', true), 'settled-half', at('list', 'list')],
    [at('list', 'list'), 'settled-full', at('list', 'list', true)],
    [at('detail', 'peek'), 'settled-full', at('detail', 'peek', true)],
    [at('detail', 'peek', true), 'settled-half', at('detail', 'peek')],
  ];
  for (const [from, event, to] of table) {
    it(`goes from ${from.state} (resting ${from.resting}, full ${from.full}) on ${event} to ${to.state} (resting ${to.resting}, full ${to.full})`, () => {
      expect(nextSheet(from, event)).toEqual(to);
    });
  }

  it('peeks at the 64 px head alone', () => {
    expect(SHEET_PEEK_HEIGHT_PX).toBe(64);
    expect(sheetHeight('peek', 800)).toBe(64);
  });

  it('opens to half the frame for the list and for a detail alike', () => {
    expect(SHEET_OPEN_FRACTION).toBe(0.5);
    expect(sheetHeight('list', 800)).toBe(400);
    expect(sheetHeight('detail', 800)).toBe(400);
    expect(sheetHeight('list', 701)).toBe(351);
    expect(sheetHeight('detail', 701)).toBe(351);
  });

  it('never covers more than half a frame that has room for the head', () => {
    for (const available of [128, 300, 533, 701, 1000]) {
      for (const state of ['list', 'detail'] as const) {
        expect(sheetHeight(state, available))
          .withContext(`${state} in ${available}`)
          .toBeLessThanOrEqual(Math.round(available / 2));
      }
    }
  });

  it('never drops below the head, nor grows past the room there is', () => {
    expect(sheetHeight('list', 100)).toBe(64);
    expect(sheetHeight('detail', 50)).toBe(50);
    expect(sheetHeight('peek', 40)).toBe(40);
    expect(sheetHeight('peek', 0)).toBe(0);
  });

  it('gives the stops for a 680 px frame in a 784 px page', () => {
    expect(sheetStops(680, 784)).toEqual({ peek: 64, half: 340, full: 784 });
  });

  it('never lets full fall below half before the page is measured', () => {
    expect(sheetStops(680, 0).full).toBe(340);
  });

  it('names the stop of every state', () => {
    expect(sheetStopOf('peek', false)).toBe('peek');
    expect(sheetStopOf('list', false)).toBe('half');
    expect(sheetStopOf('detail', false)).toBe('half');
    expect(sheetStopOf('list', true)).toBe('full');
    expect(sheetStopOf('detail', true)).toBe('full');
  });

  it('moves the handle’s tap from peek to half, half to full and full to half', () => {
    expect(stopAfterHandleTap('peek')).toBe('half');
    expect(stopAfterHandleTap('half')).toBe('full');
    expect(stopAfterHandleTap('full')).toBe('half');
  });

  it('steps one height up and down, stopping at the ends', () => {
    expect(stopAbove('peek')).toBe('half');
    expect(stopAbove('half')).toBe('full');
    expect(stopAbove('full')).toBe('full');
    expect(stopBelow('full')).toBe('half');
    expect(stopBelow('half')).toBe('peek');
    expect(stopBelow('peek')).toBe('peek');
  });
});
