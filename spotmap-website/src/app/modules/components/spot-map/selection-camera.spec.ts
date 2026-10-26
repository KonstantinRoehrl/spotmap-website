import { NO_INSETS } from '../../../models/map/map-camera';
import {
  boundsOfRect,
  CAMERA_EASE_MS,
  CAMERA_REDUCED_EASE_MS,
  CameraFrame,
  containsPoint,
  KEEP_IN_VIEW_MARGIN_PX,
  offsetToRectCentre,
  SELECTED_PIN_REACH_PX,
  sameFrame,
  SelectionCamera,
  uncoveredRect,
} from './selection-camera';
import { FLAG_REACH_PX } from './photo-pins';
import { FakeMap, requestReducedMotion } from './testing/fake-map';

/** A 1000 × 600 map whose bottom 510 px a phone's sheet covers, leaving a 90 px strip. */
const SHEET: CameraFrame = {
  width: 1000,
  height: 600,
  insets: { top: 0, right: 0, bottom: 510, left: 0 },
  headroom: 0,
};
/** The same map under a sheet capped at half of it: a 300 px strip above the sheet. */
const HALF_SHEET: CameraFrame = {
  ...SHEET,
  insets: { top: 0, right: 0, bottom: 300, left: 0 },
};
/** The same map uncovered, on the wide layout. */
const WIDE: CameraFrame = {
  width: 1000,
  height: 600,
  insets: NO_INSETS,
  headroom: 0,
};

describe('the selection camera geometry', () => {
  it('takes the covered strips off the map to leave the uncovered rectangle', () => {
    expect(
      uncoveredRect(1000, 600, { top: 10, right: 20, bottom: 510, left: 30 }),
    ).toEqual({
      left: 30,
      top: 10,
      right: 980,
      bottom: 90,
    });
  });

  it('never turns the rectangle inside out when the cover is taller than the map', () => {
    expect(
      uncoveredRect(1000, 600, { top: 0, right: 0, bottom: 700, left: 0 }),
    ).toEqual({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 0,
    });
  });

  it('offsets the camera from the map centre to the rectangle centre', () => {
    expect(
      offsetToRectCentre(1000, 600, uncoveredRect(1000, 600, SHEET.insets)),
    ).toEqual([0, -255]);
    expect(
      offsetToRectCentre(1000, 600, uncoveredRect(1000, 600, NO_INSETS)),
    ).toEqual([0, 0]);
  });

  it('counts a point as inside only past the margin', () => {
    const rect = uncoveredRect(1000, 600, NO_INSETS);
    expect(
      containsPoint(rect, { x: 500, y: 300 }, KEEP_IN_VIEW_MARGIN_PX),
    ).toBeTrue();
    expect(
      containsPoint(rect, { x: 20, y: 300 }, KEEP_IN_VIEW_MARGIN_PX),
    ).toBeFalse();
    expect(
      containsPoint(rect, { x: 500, y: 590 }, KEEP_IN_VIEW_MARGIN_PX),
    ).toBeFalse();
  });

  it('compares frames by value', () => {
    expect(
      sameFrame(SHEET, { ...SHEET, insets: { ...SHEET.insets } }),
    ).toBeTrue();
    expect(
      sameFrame(SHEET, { ...SHEET, insets: { ...SHEET.insets, bottom: 300 } }),
    ).toBeFalse();
    expect(sameFrame(SHEET, { ...SHEET, headroom: FLAG_REACH_PX })).toBeFalse();
    expect(sameFrame(SHEET, { ...SHEET, width: 999 })).toBeFalse();
  });

  it('reads the bounds of a rectangle off its two corners', () => {
    const fake = new FakeMap();
    const bounds = boundsOfRect(fake, {
      left: 0,
      top: 0,
      right: 1000,
      bottom: 90,
    });
    expect(bounds.west).toBe(0);
    expect(bounds.north).toBe(50);
    expect(bounds.east).toBe(1);
    expect(bounds.south).toBeCloseTo(49.91, 9);
    fake.remove();
  });
});

describe('SelectionCamera', () => {
  let fake: FakeMap;
  let held: boolean;
  let camera: SelectionCamera;
  const pin: [number, number] = [16.37, 48.2];

  beforeEach(() => {
    requestReducedMotion(false);
    fake = new FakeMap();
    held = false;
    camera = new SelectionCamera(fake, () => held);
  });

  afterEach(() => fake.remove());

  const eases = () =>
    fake.cameraMoves.filter((move) => move.method === 'easeTo');

  it('eases a pin hidden under a phone’s sheet to the middle of the strip above it', () => {
    // The fake projects every pin to (500, 300): under the 510 px sheet.
    camera.keepInView(pin, SHEET);
    expect(eases().length).toBe(1);
    expect(eases()[0]?.options).toEqual(
      jasmine.objectContaining({
        center: pin,
        offset: [0, -255],
        duration: CAMERA_EASE_MS,
        essential: true,
      }),
    );
  });

  it('leaves a phone’s map alone while the pin is already in the strip above the sheet', () => {
    fake.projected = { x: 500, y: 150 };
    camera.keepInView(pin, HALF_SHEET);
    camera.keepInView([16.4, 48.22], HALF_SHEET);
    expect(eases()).toEqual([]);
  });

  it('eases a phone’s map for a pin just under the sheet’s edge', () => {
    // 270 px down is inside the 300 px strip, but within the 48 px margin of the sheet's edge.
    fake.projected = { x: 500, y: 270 };
    camera.keepInView(pin, HALF_SHEET);
    expect(eases()[0]?.options).toEqual(
      jasmine.objectContaining({ center: pin, offset: [0, -150] }),
    );
  });

  it('leaves a wide map alone while the pin is on screen', () => {
    fake.projected = { x: 500, y: 300 };
    camera.keepInView(pin, WIDE);
    expect(eases()).toEqual([]);
  });

  it('eases a wide map only when the pin is off screen', () => {
    fake.projected = { x: 20, y: 300 };
    camera.keepInView(pin, WIDE);
    expect(eases()[0]?.options).toEqual(
      jasmine.objectContaining({ center: pin, offset: [0, 0] }),
    );
  });

  it('eases a map when the selected pin sits where its flag would be clipped', () => {
    const flying = { ...WIDE, headroom: FLAG_REACH_PX };
    // 50 px down is inside the pin's own 48 px margin, but the flag reaches higher than that.
    fake.projected = { x: 500, y: 50 };
    camera.keepInView(pin, flying);
    expect(eases().length).toBe(1);
    camera.keepInView(pin, WIDE);
    expect(eases().length)
      .withContext('a pin with no flag is fine there')
      .toBe(1);
    fake.projected = { x: 500, y: FLAG_REACH_PX + 60 };
    camera.keepInView(pin, flying);
    expect(eases().length).withContext('room for the flag').toBe(1);
  });

  /**
   * Where `place` seats the pin, in px below the top of a `strip`-px-tall uncovered strip of the
   * 600 px map, for a pin whose flag reaches `headroom` px above it.
   */
  const seatInStrip = (strip: number, headroom: number): number => {
    const before = eases().length;
    camera.place(pin, {
      ...SHEET,
      insets: { top: 0, right: 0, bottom: SHEET.height - strip, left: 0 },
      headroom,
    });
    const offset = eases()[before]?.options.offset;
    return (offset?.[1] ?? NaN) + SHEET.height / 2;
  };

  it('seats the pin lower in a tall strip by half the flag’s reach, so the pair is centred', () => {
    const strip = 200;
    expect(seatInStrip(strip, FLAG_REACH_PX)).toBe(
      strip / 2 + FLAG_REACH_PX / 2,
    );
  });

  it('keeps the pin and its selection ring inside a short strip', () => {
    for (const strip of [50, 80]) {
      const seat = seatInStrip(strip, FLAG_REACH_PX);
      expect(seat)
        .withContext(`ring clear of the sheet in a ${strip} px strip`)
        .toBeLessThanOrEqual(strip - SELECTED_PIN_REACH_PX);
      expect(seat)
        .withContext(`ring clear of the top in a ${strip} px strip`)
        .toBeGreaterThanOrEqual(SELECTED_PIN_REACH_PX);
    }
  });

  it('centres the pin in a strip too short to hold its ring', () => {
    const strip = SELECTED_PIN_REACH_PX;
    expect(seatInStrip(strip, FLAG_REACH_PX)).toBe(strip / 2);
    expect(seatInStrip(0, FLAG_REACH_PX)).toBe(0);
  });

  it('moves the seat by no more than the strip changes, so it never jumps', () => {
    let previous = seatInStrip(0, FLAG_REACH_PX);
    for (let strip = 1; strip <= 300; strip++) {
      const seat = seatInStrip(strip, FLAG_REACH_PX);
      expect(Math.abs(seat - previous))
        .withContext(`seat step at a ${strip} px strip`)
        .toBeLessThanOrEqual(1);
      previous = seat;
    }
  });

  it('never moves while the visitor holds the map', () => {
    held = true;
    camera.keepInView(pin, SHEET);
    camera.place(pin, SHEET);
    expect(eases()).toEqual([]);
  });

  it('shortens the ease under reduced motion instead of cutting it', () => {
    requestReducedMotion(true);
    camera.keepInView(pin, SHEET);
    expect(eases()[0]?.options.duration).toBe(CAMERA_REDUCED_EASE_MS);
    expect(eases()[0]?.options.essential).toBeTrue();
  });

  it('jumps instead of easing when placing a pin the map was built on', () => {
    camera.place(pin, SHEET);
    expect(eases()[0]?.options).toEqual(
      jasmine.objectContaining({ offset: [0, -255], duration: 0 }),
    );
  });

  it('seats a cold link’s pin in the uncovered middle even though it is already in view', () => {
    // A cold link builds the map centred on the spot: in view, but not where the visitor looks.
    fake.projected = { x: 500, y: 150 };
    camera.place(pin, HALF_SHEET);
    expect(eases()[0]?.options).toEqual(
      jasmine.objectContaining({ center: pin, offset: [0, -150], duration: 0 }),
    );
  });
});
