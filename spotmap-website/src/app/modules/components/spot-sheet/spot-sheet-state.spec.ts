import {
  INITIAL_SHEET,
  nextSheet,
  SHEET_PEEK_HEIGHT_PX,
  SheetEvent,
  SheetModel,
  sheetHeight,
} from './spot-sheet-state';

/** Shorthand for a model. */
const at = (
  state: SheetModel['state'],
  resting: SheetModel['resting'],
): SheetModel => ({ state, resting });

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
  ];
  for (const [from, event, to] of table) {
    it(`goes from ${from.state} (resting ${from.resting}) on ${event} to ${to.state} (resting ${to.resting})`, () => {
      expect(nextSheet(from, event)).toEqual(to);
    });
  }

  it('peeks at the handle strip and head alone', () => {
    expect(SHEET_PEEK_HEIGHT_PX).toBe(60);
    expect(sheetHeight('peek', 800)).toBe(60);
  });

  it('takes half the available height for the list and 85% for a detail', () => {
    expect(sheetHeight('list', 800)).toBe(400);
    expect(sheetHeight('detail', 800)).toBe(680);
    expect(sheetHeight('list', 701)).toBe(351);
    expect(sheetHeight('detail', 701)).toBe(596);
  });

  it('never drops below the peek height, nor grows past the room there is', () => {
    expect(sheetHeight('list', 100)).toBe(60);
    expect(sheetHeight('detail', 50)).toBe(50);
    expect(sheetHeight('peek', 40)).toBe(40);
    expect(sheetHeight('peek', 0)).toBe(0);
  });
});
