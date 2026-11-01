/** How much of the screen the phone layout's sheet covers: its head alone, the list, or a detail. */
export type SheetState = 'peek' | 'list' | 'detail';

/**
 * The sheet's state, plus the non-detail height it returns to when a detail closes elsewhere, by
 * the browser's Back or a city change: the list if the visitor had it open, else the peek bar.
 */
export interface SheetModel {
  readonly state: SheetState;
  readonly resting: 'peek' | 'list';
  /** Whether an open sheet is at the page's full height; always false at peek. */
  readonly full: boolean;
}

/** A fresh map page: the sheet shows its head only. */
export const INITIAL_SHEET: SheetModel = {
  state: 'peek',
  resting: 'peek',
  full: false,
};

/**
 * What can move the sheet: a tap on its head, a spot opening, the head's `< OVERVIEW` back plate or
 * close (✕), the detail closing without the sheet (Back, a city change), a tap on empty map, or a
 * spot link that names no spot (the list opens to show the not-found line), or the sheet coming
 * to rest at a stop.
 */
export type SheetEvent =
  | 'head'
  | 'opened'
  | 'back'
  | 'close'
  | 'closed-elsewhere'
  | 'map-tap'
  | 'not-found'
  | 'settled-peek'
  | 'settled-half'
  | 'settled-full';

/** Where the sheet comes to rest: its head alone, half the frame, or the whole page area. */
export type SheetStop = 'peek' | 'half' | 'full';

/** Each stop's height in px. */
export type SheetStops = Readonly<Record<SheetStop, number>>;

/** The peek height: the 64 px head alone (16 px above, below and beside its 32 px controls). */
export const SHEET_PEEK_HEIGHT_PX = 64;

/**
 * The half stop's share of the frame, the same for the list and a detail, and the most the map is
 * told is covered, so the selected pin always has the upper half to sit in.
 */
export const SHEET_OPEN_FRACTION = 0.5;

/**
 * The sheet's next state after `event`. Every height is reachable by tapping alone.
 * An event that does not apply to the current state leaves the model as it is.
 */
export function nextSheet(model: SheetModel, event: SheetEvent): SheetModel {
  switch (event) {
    case 'head':
      if (model.state === 'peek') {
        return { state: 'list', resting: 'list', full: false };
      }
      if (model.state === 'list') {
        return { state: 'peek', resting: 'peek', full: false };
      }
      return model;
    case 'opened':
      return { state: 'detail', resting: model.resting, full: model.full };
    case 'back':
      return model.state === 'detail'
        ? { state: 'list', resting: 'list', full: model.full }
        : model;
    case 'close':
    case 'map-tap':
      return model.state === 'detail'
        ? { state: 'peek', resting: 'peek', full: false }
        : model;
    case 'closed-elsewhere':
      return model.state === 'detail'
        ? {
            state: model.resting,
            resting: model.resting,
            full: model.resting === 'list' && model.full,
          }
        : model;
    case 'not-found':
      return { state: 'list', resting: 'list', full: false };
    case 'settled-peek':
      return { state: 'peek', resting: 'peek', full: false };
    case 'settled-half':
    case 'settled-full': {
      const full = event === 'settled-full';
      return model.state === 'peek'
        ? { state: 'list', resting: 'list', full }
        : { ...model, full };
    }
  }
}

/** The stops, lowest first. */
const STOPS: readonly SheetStop[] = ['peek', 'half', 'full'];

/**
 * Each stop's height when the frame is `available` px tall and the page area `page` px. Full is
 * never below half, which also covers a page not measured yet.
 */
export function sheetStops(available: number, page: number): SheetStops {
  const half = sheetHeight('list', available);
  return {
    peek: sheetHeight('peek', available),
    half,
    full: Math.max(page, half),
  };
}

/** The stop a sheet in `state` rests at. */
export function sheetStopOf(state: SheetState, full: boolean): SheetStop {
  if (state === 'peek') {
    return 'peek';
  }
  return full ? 'full' : 'half';
}

/** Where a tap on the handle takes the sheet from `stop`. */
export function stopAfterHandleTap(stop: SheetStop): SheetStop {
  return stop === 'half' ? 'full' : 'half';
}

/** One height above `stop`, or `stop` at the top. */
export function stopAbove(stop: SheetStop): SheetStop {
  return STOPS[Math.min(STOPS.indexOf(stop) + 1, STOPS.length - 1)];
}

/** One height below `stop`, or `stop` at the bottom. */
export function stopBelow(stop: SheetStop): SheetStop {
  return STOPS[Math.max(STOPS.indexOf(stop) - 1, 0)];
}

/**
 * The height the page reports to the map for `state` when the frame it sits in is `available` px
 * tall: the head, or half the frame for any open sheet, full included, rounded to whole pixels. It never drops below the head — so a frame
 * under twice the head's height is covered by more than half — and never grows past the room
 * there is.
 */
export function sheetHeight(state: SheetState, available: number): number {
  const target =
    state === 'peek'
      ? SHEET_PEEK_HEIGHT_PX
      : Math.round(available * SHEET_OPEN_FRACTION);
  return Math.min(
    Math.max(target, SHEET_PEEK_HEIGHT_PX),
    Math.max(available, 0),
  );
}
