import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  FLAG_FADE_MS,
  FLAG_HANDOFF_TIMEOUT_MS,
  FLAG_MOTION_MS,
  type FlagOptions,
  type FlagSpot,
  type FlagView,
  SelectionFlag,
  SYMBOL_FADE_MS,
} from './selection-flag';
import { HAS_COVER, photoPinFilter } from './spot-layers';
import { FakeMap } from './testing/fake-map';

/** A standing spot with a photo. */
const A: FlagSpot = {
  id: 'a',
  photo: 'https://photos.test/thumb/vienna/a.webp',
  demolished: false,
  coordinates: [16.37, 48.2],
};
/** A demolished spot with a photo. */
const B: FlagSpot = {
  id: 'b',
  photo: 'https://photos.test/thumb/vienna/b.webp',
  demolished: true,
  coordinates: [16.4, 48.22],
};
/** A selection the visitor made, with motion. */
const MOVING: FlagOptions = { animate: true, reduced: false };

describe('SelectionFlag', () => {
  let fake: FakeMap;
  let views: readonly FlagView[];
  let flag: SelectionFlag;

  beforeEach(() => {
    jasmine.clock().install();
    fake = new FakeMap();
    views = [];
    flag = new SelectionFlag(
      fake as unknown as MapLibreMap,
      (next) => (views = next),
    );
  });

  afterEach(() => {
    flag.dispose();
    fake.remove();
    jasmine.clock().uninstall();
  });

  /** What the template draws, as `<id> <rest> <phase>` per flag. */
  const drawn = () =>
    views.map((view) => `${view.id} ${view.rest} ${view.phase}`);
  /** The filter last set on the photo pins, if any. */
  const photoFilter = () =>
    [...fake.filterCalls].reverse().find((call) => call.layer === 'spots-photo')
      ?.filter;
  /** Puts `a`'s photo pin on screen as MapLibre places it, or takes it off. */
  const placeA = (placed: boolean) => {
    fake.placedPhotos = placed ? [{ id: 'a', properties: { id: 'a' } }] : [];
  };

  it('stands on a placed photo pin, hides the pin, and rises once the map has taken it away', () => {
    placeA(true);
    flag.show(A, MOVING);
    expect(drawn()).toEqual(['a pin held']);
    expect(photoFilter()).toEqual(photoPinFilter(['a']));
    fake.emit('render');
    expect(drawn())
      .withContext('the pin is still drawn, so the flag waits on it')
      .toEqual(['a pin held']);
    placeA(false);
    fake.emit('render');
    expect(drawn()).toEqual(['a pin rising']);
    expect(fake.handlers.get('render'))
      .withContext('stops listening')
      .toEqual([]);
  });

  it('rises at once out of the dot of a spot whose photo pin was not placed', () => {
    placeA(false);
    flag.show(A, MOVING);
    expect(drawn()).toEqual(['a dot rising']);
    expect(photoFilter()).toEqual(photoPinFilter(['a']));
  });

  it('rises anyway when the map is slow to take the pin away', () => {
    placeA(true);
    flag.show(A, MOVING);
    jasmine.clock().tick(FLAG_HANDOFF_TIMEOUT_MS - 1);
    expect(drawn()).toEqual(['a pin held']);
    jasmine.clock().tick(1);
    expect(drawn()).toEqual(['a pin rising']);
    expect(fake.handlers.get('render')).toEqual([]);
  });

  it('stands raised at once on a map built on the spot', () => {
    flag.show(A, { animate: false, reduced: false });
    expect(drawn()).toEqual(['a dot raised']);
    expect(photoFilter()).toEqual(photoPinFilter(['a']));
  });

  it('falls back into its pin, gives the pin back once landed, and fades its copy after the symbol fade', () => {
    placeA(true);
    flag.show(A, MOVING);
    placeA(false);
    fake.emit('render');
    flag.show(null, MOVING);
    expect(drawn()).toEqual(['a pin falling']);
    expect(photoFilter())
      .withContext('the pin stays hidden while the flag falls')
      .toEqual(photoPinFilter(['a']));
    jasmine.clock().tick(FLAG_MOTION_MS);
    expect(photoFilter()).toEqual(HAS_COVER);
    expect(drawn())
      .withContext('the copy covers the pin fading back in')
      .toEqual(['a pin falling']);
    jasmine.clock().tick(SYMBOL_FADE_MS);
    expect(drawn()).toEqual(['a pin leaving']);
    jasmine.clock().tick(FLAG_FADE_MS);
    expect(drawn()).toEqual([]);
  });

  it('falls back into its dot and goes, giving the pin back', () => {
    flag.show(A, MOVING);
    flag.show(null, MOVING);
    expect(drawn()).toEqual(['a dot falling']);
    jasmine.clock().tick(FLAG_MOTION_MS);
    expect(drawn()).toEqual([]);
    expect(photoFilter()).toEqual(HAS_COVER);
  });

  it('lowers one flag while the next rises, hiding both pins until the first has landed', () => {
    flag.show(A, MOVING);
    flag.show(B, MOVING);
    expect(drawn()).toEqual(['a dot falling', 'b dot rising']);
    expect(views[1]?.demolished).toBeTrue();
    expect(photoFilter()).toEqual(photoPinFilter(['a', 'b']));
    jasmine.clock().tick(FLAG_MOTION_MS);
    expect(drawn()).toEqual(['b dot rising']);
    expect(photoFilter()).toEqual(photoPinFilter(['b']));
  });

  it('gives the pin straight back for a flag that never left it', () => {
    placeA(true);
    flag.show(A, MOVING);
    flag.show(null, MOVING);
    expect(drawn()).toEqual([]);
    expect(photoFilter()).toEqual(HAS_COVER);
    expect(fake.handlers.get('render')).toEqual([]);
  });

  it('picks a falling flag up again where it stands', () => {
    flag.show(A, MOVING);
    flag.show(null, MOVING);
    flag.show(A, MOVING);
    expect(drawn()).toEqual(['a dot rising']);
    jasmine.clock().tick(FLAG_MOTION_MS + SYMBOL_FADE_MS + FLAG_FADE_MS);
    expect(drawn())
      .withContext('the earlier fall never lands')
      .toEqual(['a dot rising']);
    expect(photoFilter()).toEqual(photoPinFilter(['a']));
  });

  it('times its fall as a crossfade under reduced motion', () => {
    const reduced: FlagOptions = { animate: true, reduced: true };
    flag.show(A, reduced);
    expect(views[0]?.reduced).toBeTrue();
    flag.show(null, reduced);
    jasmine.clock().tick(FLAG_FADE_MS);
    expect(drawn()).toEqual([]);
  });

  it('leaves a selection it already flies alone', () => {
    flag.show(A, MOVING);
    const filters = fake.filterCalls.length;
    flag.show(A, MOVING);
    expect(fake.filterCalls.length).toBe(filters);
    expect(drawn()).toEqual(['a dot rising']);
  });

  it('draws each flag where the map puts its spot, and follows the map', () => {
    fake.projectedAt = ([lng]) =>
      lng === 16.37 ? { x: 100, y: 200 } : { x: 0, y: 0 };
    flag.show(A, MOVING);
    expect(views[0]).toEqual(
      jasmine.objectContaining({
        id: 'a',
        photo: A.photo,
        demolished: false,
        x: 100,
        y: 200,
        reduced: false,
      }),
    );
    fake.projectedAt = () => ({ x: 120, y: 210 });
    flag.reposition();
    expect([views[0]?.x, views[0]?.y]).toEqual([120, 210]);
  });

  it('lets go of its timers and its render listener on dispose', () => {
    flag.show(B, MOVING);
    flag.show(null, MOVING);
    placeA(true);
    flag.show(A, MOVING);
    const before = drawn();
    const filters = fake.filterCalls.length;
    flag.dispose();
    expect(fake.handlers.get('render')).toEqual([]);
    jasmine
      .clock()
      .tick(
        FLAG_HANDOFF_TIMEOUT_MS +
          FLAG_MOTION_MS +
          SYMBOL_FADE_MS +
          FLAG_FADE_MS,
      );
    expect(fake.filterCalls.length).toBe(filters);
    expect(drawn()).withContext('nothing drawn after dispose').toEqual(before);
  });
});
