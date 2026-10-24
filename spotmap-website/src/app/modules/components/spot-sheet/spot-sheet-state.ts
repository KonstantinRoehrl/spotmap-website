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

/** The peek height: the 15px grab-handle strip, the 1px top border and the 44px head row. */
export const SHEET_PEEK_HEIGHT_PX = 60;

/** The list's share of the available height. */
export const SHEET_LIST_FRACTION = 0.5;

/** A detail's share of the available height, leaving a strip of map for the selected pin. */
export const SHEET_DETAIL_FRACTION = 0.85;

/**
 * The sheet's next state after `event` (spec §4.2). Every height is reachable by tapping alone.
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
 * The sheet's height in px for `state` when `available` px are free above the bottom edge: the
 * peek bar, or a share of the room, rounded to whole pixels. It never drops below the peek bar
 * and never grows past the room there is. The page uses the same figure to tell the map how much
 * of it the sheet covers.
 */
export function sheetHeight(state: SheetState, available: number): number {
  const target =
    state === 'peek'
      ? SHEET_PEEK_HEIGHT_PX
      : Math.round(
          available *
            (state === 'list' ? SHEET_LIST_FRACTION : SHEET_DETAIL_FRACTION),
        );
  return Math.min(
    Math.max(target, SHEET_PEEK_HEIGHT_PX),
    Math.max(available, 0),
  );
}
