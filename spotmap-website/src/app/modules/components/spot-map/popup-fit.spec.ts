import {
  BODY_MIN_HEIGHT_PX,
  fitBoxWithin,
  fitPopup,
  GALLERY_MIN_HEIGHT_PX,
  popupFrame,
  POPUP_FIT_MARGIN_PX,
  POPUP_TIP_HEIGHT_PX,
} from './popup-fit';

/** A 1000 × 600 map with nothing scrolled away: the fit box is the frame inset by 16 px. */
const BOX = { left: 16, top: 16, right: 984, bottom: 584 };
/** A popup with photos: 227 px of gallery (4:3 on 302 px) and 150 px of everything else. */
const PHOTO_POPUP = {
  width: 320,
  naturalGalleryHeight: 227,
  naturalBodyHeight: 150,
};

describe('fitBoxWithin', () => {
  it('insets the map frame by the margin when all of it is on screen', () => {
    expect(
      fitBoxWithin(
        { left: 100, top: 50, right: 1100, bottom: 650 },
        { left: 0, top: 0, right: 1400, bottom: 900 },
      ),
    ).toEqual({ left: 16, top: 16, right: 984, bottom: 584 });
  });

  it('keeps only the visible part of a frame scrolled half off screen', () => {
    expect(
      fitBoxWithin(
        { left: 0, top: -300, right: 400, bottom: 500 },
        { left: 0, top: 0, right: 400, bottom: 700 },
      ),
    ).toEqual({ left: 16, top: 316, right: 384, bottom: 784 });
  });

  it('collapses rather than inverts when the visible part is thinner than the margins', () => {
    const box = fitBoxWithin(
      { left: 0, top: 0, right: 20, bottom: 20 },
      { left: 0, top: 0, right: 20, bottom: 20 },
    );
    expect(box.right).toBe(box.left);
    expect(box.bottom).toBe(box.top);
  });

  describe('with a strip at the bottom of the frame reserved', () => {
    const frame = { left: 100, top: 50, right: 1100, bottom: 650 };
    const onScreen = { left: 0, top: 0, right: 1400, bottom: 900 };

    it('ends the box above the strip, and keeps the margin above that too', () => {
      expect(
        fitBoxWithin(frame, onScreen, POPUP_FIT_MARGIN_PX, 78).bottom,
      ).toBe(600 - 78 - 16);
    });

    it('leaves the other three edges where the margin puts them', () => {
      const { left, top, right } = fitBoxWithin(
        frame,
        onScreen,
        POPUP_FIT_MARGIN_PX,
        78,
      );
      expect({ left, top, right }).toEqual({ left: 16, top: 16, right: 984 });
    });

    it('is the same box as before when nothing is reserved', () => {
      expect(fitBoxWithin(frame, onScreen, POPUP_FIT_MARGIN_PX, 0)).toEqual(
        fitBoxWithin(frame, onScreen),
      );
    });

    it('ignores a strip that sits below the visible part of a scrolled frame', () => {
      // The frame's bottom edge, strip included, is below the screen: the screen is what ends the box.
      const scrolled = { left: 0, top: 0, right: 400, bottom: 700 };
      const tall = { left: 0, top: 0, right: 400, bottom: 1200 };
      expect(fitBoxWithin(tall, scrolled, POPUP_FIT_MARGIN_PX, 40).bottom).toBe(
        700 - 16,
      );
    });

    it('collapses rather than inverts when the strip leaves no room', () => {
      const box = fitBoxWithin(frame, onScreen, POPUP_FIT_MARGIN_PX, 700);
      expect(box.bottom).toBe(box.top);
    });
  });
});

describe('popupFrame', () => {
  it('opens above a pin with more room above', () => {
    expect(popupFrame(BOX, { x: 500, y: 500 }).anchor).toBe('bottom');
  });

  it('opens below a pin with more room below', () => {
    expect(popupFrame(BOX, { x: 500, y: 40 }).anchor).toBe('top');
  });

  it('caps the width at 320 px', () => {
    expect(popupFrame(BOX, { x: 500, y: 300 }).maxWidth).toBe(320);
  });

  it('narrows to the fit box on a 360 px phone (map frame 330 px)', () => {
    const phone = fitBoxWithin(
      { left: 15, top: 0, right: 345, bottom: 600 },
      { left: 0, top: 0, right: 360, bottom: 740 },
    );
    expect(popupFrame(phone, { x: 165, y: 300 }).maxWidth).toBe(298);
  });
});

describe('fitPopup', () => {
  it('flips above a pin whose room below is taken by a reserved bottom strip', () => {
    const frame = { left: 100, top: 50, right: 1100, bottom: 650 };
    const onScreen = { left: 0, top: 0, right: 1400, bottom: 900 };
    const popup = {
      pin: { x: 500, y: 450 },
      width: 300,
      naturalGalleryHeight: 0,
      naturalBodyHeight: 100,
      keepAnchor: 'top' as const,
    };
    expect(fitPopup({ box: fitBoxWithin(frame, onScreen), ...popup }).anchor)
      .withContext('with the whole frame to use, the popup stays below the pin')
      .toBe('top');
    const fit = fitPopup({
      box: fitBoxWithin(frame, onScreen, POPUP_FIT_MARGIN_PX, 78),
      ...popup,
    });
    expect(fit.anchor).toBe('bottom');
    expect(fit.panBy).toEqual([0, 0]);
  });

  it('needs no pan for a pin with room on its side', () => {
    const fit = fitPopup({ box: BOX, pin: { x: 500, y: 40 }, ...PHOTO_POPUP });
    expect(fit.anchor).toBe('top');
    expect(fit.panBy).toEqual([0, 0]);
    expect(fit.galleryHeight).toBe(227);
    expect(fit.scrolls).toBeFalse();
  });

  // MapLibre's panBy([dx, dy]) moves the view by dx/dy, so the content shifts by −dx/−dy. A popup
  // poking out of the top must come down, which is a negative dy.
  it('pans the content down for a popup that pokes out of the top (negative dy)', () => {
    const fit = fitPopup({ box: BOX, pin: { x: 500, y: 300 }, ...PHOTO_POPUP });
    expect(fit.anchor).toBe('bottom');
    // top = 300 − 10 − 377 = −87; it has to reach 16.
    expect(fit.panBy).toEqual([0, -103]);
  });

  it('pans the content right for a pin at the left edge (negative dx)', () => {
    expect(
      fitPopup({ box: BOX, pin: { x: 20, y: 500 }, ...PHOTO_POPUP }).panBy,
    ).toEqual([-156, 0]);
  });

  it('pans the content left for a pin at the right edge (positive dx)', () => {
    expect(
      fitPopup({ box: BOX, pin: { x: 980, y: 500 }, ...PHOTO_POPUP }).panBy,
    ).toEqual([156, 0]);
  });

  it('gives up a kept side that no longer has room for the popup', () => {
    const fit = fitPopup({
      box: BOX,
      pin: { x: 500, y: 300 },
      ...PHOTO_POPUP,
      keepAnchor: 'top',
    });
    // 'top' has 284 px below the pin, too little for 377 + 10 px, so the roomier side wins.
    expect(fit.anchor).toBe('bottom');
  });

  it('fits a pin in each corner by panning only along the edge it touches', () => {
    expect(
      fitPopup({ box: BOX, pin: { x: 20, y: 20 }, ...PHOTO_POPUP }).panBy,
    ).toEqual([-156, 0]);
    expect(
      fitPopup({ box: BOX, pin: { x: 980, y: 20 }, ...PHOTO_POPUP }).panBy,
    ).toEqual([156, 0]);
    expect(
      fitPopup({ box: BOX, pin: { x: 20, y: 580 }, ...PHOTO_POPUP }).panBy,
    ).toEqual([-156, 0]);
    expect(
      fitPopup({ box: BOX, pin: { x: 980, y: 580 }, ...PHOTO_POPUP }).panBy,
    ).toEqual([156, 0]);
  });

  it('keeps its side on a re-fit while that side still has room', () => {
    const fit = fitPopup({
      box: BOX,
      pin: { x: 500, y: 350 },
      ...PHOTO_POPUP,
      naturalGalleryHeight: 0,
      naturalBodyHeight: 100,
      keepAnchor: 'top',
    });
    // 110 px needed and 234 px below: the side holds, although above (334 px) has more room.
    expect(fit.anchor).toBe('top');
    expect(popupFrame(BOX, { x: 500, y: 350 }).anchor).toBe('bottom');
  });

  it('squeezes the gallery before anything scrolls', () => {
    const fit = fitPopup({
      box: { left: 16, top: 16, right: 344, bottom: 326 },
      pin: { x: 180, y: 320 },
      ...PHOTO_POPUP,
    });
    // cap 300: 150 of body leaves 150 for the gallery, above its 120 px minimum.
    expect(fit.maxHeight).toBe(300);
    expect(fit.galleryHeight).toBe(150);
    expect(fit.scrolls).toBeFalse();
  });

  it('stops the gallery at its minimum and scrolls the body for tall content', () => {
    const fit = fitPopup({
      box: { left: 16, top: 16, right: 344, bottom: 226 },
      pin: { x: 180, y: 220 },
      ...PHOTO_POPUP,
    });
    expect(fit.maxHeight).toBe(200);
    expect(fit.galleryHeight).toBe(GALLERY_MIN_HEIGHT_PX);
    expect(fit.scrolls).toBeTrue();
  });

  it('keeps one row of body visible in a frame too short for the gallery minimum', () => {
    const fit = fitPopup({
      box: { left: 16, top: 16, right: 314, bottom: 134 },
      pin: { x: 165, y: 75 },
      ...PHOTO_POPUP,
    });
    expect(fit.maxHeight).toBe(118 - POPUP_TIP_HEIGHT_PX);
    expect(fit.galleryHeight).toBe(fit.maxHeight - BODY_MIN_HEIGHT_PX);
    expect(fit.scrolls).toBeTrue();
    // Capped at 108 + 10 px of tip it fills the 118 px box exactly once panned.
    expect(fit.panBy).toEqual([0, -59]);
  });

  it('never grows a gallery for a spot without photos', () => {
    const fit = fitPopup({
      box: { left: 16, top: 16, right: 314, bottom: 134 },
      pin: { x: 165, y: 75 },
      width: 298,
      naturalGalleryHeight: 0,
      naturalBodyHeight: 300,
    });
    expect(fit.galleryHeight).toBe(0);
    expect(fit.scrolls).toBeTrue();
  });

  it('reports a pan of exactly zero, never −0', () => {
    const [dx, dy] = fitPopup({
      box: BOX,
      pin: { x: 500, y: 40 },
      ...PHOTO_POPUP,
    }).panBy;
    expect(Object.is(dx, 0)).toBeTrue();
    expect(Object.is(dy, 0)).toBeTrue();
  });
});
