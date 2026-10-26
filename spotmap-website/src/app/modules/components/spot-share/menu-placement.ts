/** Which side of its trigger a menu opens on. */
export type MenuPlacement = 'above' | 'below';

/** A vertical extent on screen, in px from the viewport's top: a `DOMRect` is one. */
export interface VerticalBand {
  readonly top: number;
  readonly bottom: number;
}

/** The space between a trigger and the menu it opens, in px: the spacing scale's item gap. */
export const MENU_GAP_PX = 8;

/**
 * Where a menu `menuHeight` px tall opens against `trigger` inside `band` (the part of the screen
 * it may cover: its clipping ancestor's box, clipped to the viewport): below when it fits there,
 * else above when it fits there, else on whichever side has more room.
 *
 * @param gap the space kept between the trigger and the menu
 */
export function menuPlacement(
  trigger: VerticalBand,
  band: VerticalBand,
  menuHeight: number,
  gap = MENU_GAP_PX,
): MenuPlacement {
  const below = band.bottom - trigger.bottom - gap;
  const above = trigger.top - band.top - gap;
  if (below >= menuHeight) {
    return 'below';
  }
  if (above >= menuHeight) {
    return 'above';
  }
  return above > below ? 'above' : 'below';
}
