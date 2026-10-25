import { NO_INSETS } from '../../../models/map/map-camera';
import {
  boundsOfRect,
  CAMERA_EASE_MS,
  CAMERA_REDUCED_EASE_MS,
  CameraFrame,
  containsPoint,
  KEEP_IN_VIEW_MARGIN_PX,
  offsetToRectCentre,
  sameFrame,
  SelectionCamera,
  uncoveredRect,
} from './selection-camera';
import { FLAG_REACH_PX } from './photo-pins';
import { FakeMap, requestReducedMotion } from './testing/fake-map';

/** A 1000 × 600 map whose bottom 510 px a phone's sheet covers. */
const SHEET: CameraFrame = {
  width: 1000,
  height: 600,
  insets: { top: 0, right: 0, bottom: 510, left: 0 },
  framing: 'centre',
  headroom: 0,
};
/** The same map uncovered, on the wide layout. */
const WIDE: CameraFrame = {
  width: 1000,
  height: 600,
  insets: NO_INSETS,
  framing: 'reveal',
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
    expect(sameFrame(SHEET, { ...SHEET, framing: 'reveal' })).toBeFalse();
    expect(
      sameFrame(SHEET, { ...SHEET, insets: { ...SHEET.insets, bottom: 300 } }),
    ).toBeFalse();
    expect(sameFrame(SHEET, { ...SHEET, headroom: FLAG_REACH_PX })).toBeFalse();
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

  it('eases a pin to the middle of a phone’s uncovered strip', () => {
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

  it('eases a wide map when the selected pin sits where its flag would be clipped', () => {
    const flying = { ...WIDE, headroom: FLAG_REACH_PX };
    // 50 px down is inside the pin's own 48 px margin, but the flag reaches 62 px above it.
    fake.projected = { x: 500, y: 50 };
    camera.keepInView(pin, flying);
    expect(eases().length).toBe(1);
    camera.keepInView(pin, WIDE);
    expect(eases().length)
      .withContext('a pin with no flag is fine there')
      .toBe(1);
    fake.projected = { x: 500, y: 120 };
    camera.keepInView(pin, flying);
    expect(eases().length).withContext('room for the flag').toBe(1);
  });

  it('seats the pin lower in the strip by half the flag’s reach, so the pair is centred', () => {
    camera.keepInView(pin, { ...SHEET, headroom: FLAG_REACH_PX });
    expect(eases()[0]?.options.offset).toEqual([0, -255 + FLAG_REACH_PX / 2]);
  });

  it('never eases while the visitor holds the map', () => {
    held = true;
    camera.keepInView(pin, SHEET);
    camera.open(pin, SHEET);
    camera.restore();
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

  it('saves the view an open starts from and eases back to it on restore', () => {
    fake.center = { lng: 16.5, lat: 48.3 };
    fake.zoom = 12;
    camera.open(pin, SHEET);
    camera.restore();
    expect(eases().at(-1)?.options).toEqual(
      jasmine.objectContaining({
        center: [16.5, 48.3],
        zoom: 12,
        duration: CAMERA_EASE_MS,
      }),
    );
  });

  it('keeps the first saved view across a switch to another spot', () => {
    fake.center = { lng: 16.5, lat: 48.3 };
    camera.open(pin, SHEET);
    camera.open([16.4, 48.22], SHEET);
    camera.restore();
    expect(eases().at(-1)?.options.center).toEqual([16.5, 48.3]);
  });

  it('restores nothing when nothing was saved, and only once', () => {
    camera.place(pin, SHEET);
    const placed = eases().length;
    camera.restore();
    expect(eases().length)
      .withContext('a cold open saved no view')
      .toBe(placed);
    fake.center = { lng: 16.5, lat: 48.3 };
    camera.open(pin, SHEET);
    camera.restore();
    const restored = eases().length;
    camera.restore();
    expect(eases().length).toBe(restored);
  });

  it('does not ease back to a view the camera never left', () => {
    fake.projected = { x: 500, y: 300 };
    camera.open(pin, WIDE);
    camera.restore();
    expect(eases()).toEqual([]);
  });
});
