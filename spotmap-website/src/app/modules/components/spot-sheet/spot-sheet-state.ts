/** How much of the screen the phone layout's sheet covers: its head alone, the list, or a detail. */
export type SheetState = 'peek' | 'list' | 'detail';

/**
 * The sheet's state, plus the non-detail height it returns to when a detail closes elsewhere, by
 * the browser's Back or a city change: the list if the visitor had it open, else the peek bar.
 */
export interface SheetModel {
  readonly state: SheetState;
  readonly resting: 'peek' | 'list';
}

/** A fresh map page: the sheet shows its head only. */
export const INITIAL_SHEET: SheetModel = { state: 'peek', resting: 'peek' };

/**
 * What can move the sheet: a tap on its head, a spot opening, the head's back (‹) or close (✕),
 * the detail closing without the sheet (Back, a city change), a tap on empty map, or a spot link
 * that names no spot (the list opens to show the not-found line).
 */
export type SheetEvent =
  | 'head'
  | 'opened'
  | 'back'
  | 'close'
  | 'closed-elsewhere'
  | 'map-tap'
  | 'not-found';

/** The peek height: the 64 px head alone (16 px above, below and beside its 32 px controls). */
export const SHEET_PEEK_HEIGHT_PX = 64;

/**
 * The open sheet's share of the frame, the same for the list and a detail: it never covers more
 * than half the map, so the selected pin always has the upper half to sit in.
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
        return { state: 'list', resting: 'list' };
      }
      if (model.state === 'list') {
        return { state: 'peek', resting: 'peek' };
      }
      return model;
    case 'opened':
      return { state: 'detail', resting: model.resting };
    case 'back':
      return model.state === 'detail'
        ? { state: 'list', resting: 'list' }
        : model;
    case 'close':
    case 'map-tap':
      return model.state === 'detail'
        ? { state: 'peek', resting: 'peek' }
        : model;
    case 'closed-elsewhere':
      return model.state === 'detail'
        ? { state: model.resting, resting: model.resting }
        : model;
    case 'not-found':
      return { state: 'list', resting: 'list' };
  }
}

/**
 * The sheet's height in px for `state` when the frame it sits in is `available` px tall: the
 * head, or half the frame, rounded to whole pixels. It never drops below the head — so a frame
 * under twice the head's height is covered by more than half — and never grows past the room
 * there is. The page uses the same figure to tell the map how much of it the sheet covers.
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
