import { MENU_GAP_PX, menuPlacement } from './menu-placement';

describe('menuPlacement', () => {
  const band = { top: 0, bottom: 600 };

  it('opens below the trigger when the menu fits there', () => {
    expect(menuPlacement({ top: 100, bottom: 144 }, band, 104)).toBe('below');
  });

  it('opens above the trigger when it fits there but not below', () => {
    expect(menuPlacement({ top: 500, bottom: 544 }, band, 104)).toBe('above');
  });

  it('counts the gap on either side', () => {
    // 600 - 544 = 56 px below: a 50 px menu fits only without the 8 px gap.
    expect(menuPlacement({ top: 500, bottom: 544 }, band, 50)).toBe('above');
    expect(menuPlacement({ top: 500, bottom: 544 }, band, 50, 0)).toBe('below');
    expect(MENU_GAP_PX).toBe(8);
  });

  it('takes the side with more room when it fits on neither', () => {
    const tight = { top: 0, bottom: 200 };
    expect(menuPlacement({ top: 120, bottom: 164 }, tight, 150)).toBe('above');
    expect(menuPlacement({ top: 30, bottom: 74 }, tight, 150)).toBe('below');
  });

  it('measures against the band, not the page', () => {
    const pane = { top: 300, bottom: 700 };
    // 100 px of pane above the trigger, 556 below it.
    expect(menuPlacement({ top: 400, bottom: 444 }, pane, 104)).toBe('below');
    expect(menuPlacement({ top: 620, bottom: 664 }, pane, 104)).toBe('above');
  });
});
