import { MAP_PALETTE } from './map-palette';
import {
  FLAG_AT_REST_FILTER,
  flagFilter,
  HAS_COVER,
  LOCK_ON_AT_REST_FILTER,
  PHOTO_PIN_LAYERS,
  photoPinFilter,
  SELECTED_RING_RADIUS,
  SPOT_LAYERS,
  SPOT_SOURCE_ID,
} from './spot-layers';

/** A spot as the pin layers see it: its id, its status, and whether it is the selected one. */
interface Pin {
  id: string;
  status: 'active' | 'demolished';
  selected: boolean;
  /** Whether a pointer or its list row hovers it. */
  hovered?: boolean;
}

/**
 * Evaluates the slice of MapLibre's expression language the pin layers use — `case`, `==`, `!=`,
 * `!`, `get`, `boolean` and `feature-state` — and throws on anything else.
 */
function evaluate(expression: unknown, pin: Pin): unknown {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression as unknown[];
  switch (operator) {
    case 'case': {
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (evaluate(args[i], pin) === true) return evaluate(args[i + 1], pin);
      }
      return evaluate(args[args.length - 1], pin);
    }
    case '==':
      return evaluate(args[0], pin) === evaluate(args[1], pin);
    case '!=':
      return evaluate(args[0], pin) !== evaluate(args[1], pin);
    case '!':
      return evaluate(args[0], pin) !== true;
    case 'get': {
      const key = args[0];
      return key === 'status' || key === 'id' ? pin[key] : null;
    }
    case 'feature-state':
      return args[0] === 'selected'
        ? pin.selected
        : args[0] === 'hovered'
          ? (pin.hovered ?? false)
          : null;
    case 'boolean': {
      const value = evaluate(args[0], pin);
      return typeof value === 'boolean' ? value : evaluate(args[1], pin);
    }
    default:
      throw new Error(`unsupported expression: ${JSON.stringify(operator)}`);
  }
}

/** One pin layer, by id. */
function layer(id: string) {
  const found = SPOT_LAYERS.find((l) => l.id === id);
  if (!found) throw new Error(`no pin layer ${id}`);
  return found;
}

/** What one paint property of one layer comes to for this pin. */
function paintFor(id: string, property: string, pin: Pin): unknown {
  return evaluate((layer(id).paint as Record<string, unknown>)[property], pin);
}

/** Whether a layer draws this pin at all. */
function drawsPin(id: string, pin: Pin): boolean {
  const filter = layer(id).filter;
  return filter === undefined || evaluate(filter, pin) === true;
}

const active: Pin = { id: 'a', status: 'active', selected: false };
const demolished: Pin = { id: 'd', status: 'demolished', selected: false };
const selected = (pin: Pin): Pin => ({ ...pin, selected: true });

describe('SPOT_LAYERS', () => {
  it('draws the pins in paint order, thumb target first, all from the spot source', () => {
    expect(SPOT_LAYERS.map((l) => l.id)).toEqual([
      'spots-hit',
      'spots-glow',
      'spots-selected-gap',
      'spots-selected',
      'spots-lock-on',
      'spots-body',
      'spots-hover',
      'spots-demolished-mark',
    ]);
    for (const l of SPOT_LAYERS) {
      expect(l.source).withContext(l.id).toBe(SPOT_SOURCE_ID);
    }
  });

  it('keeps the thumb target 22 px and invisible', () => {
    expect(paintFor('spots-hit', 'circle-radius', active)).toBe(22);
    expect(paintFor('spots-hit', 'circle-opacity', active)).toBe(0);
  });

  it('tells a spot’s status by shape, not by hue', () => {
    expect(paintFor('spots-body', 'circle-opacity', active)).toBe(1);
    expect(paintFor('spots-body', 'circle-color', active)).toBe(
      MAP_PALETTE.pinActive,
    );
    expect(paintFor('spots-body', 'circle-stroke-color', demolished)).toBe(
      MAP_PALETTE.pinDemolished,
    );
    expect(paintFor('spots-body', 'circle-stroke-width', demolished)).toBe(2);
    expect(drawsPin('spots-demolished-mark', demolished)).toBe(true);
    expect(drawsPin('spots-demolished-mark', active)).toBe(false);
    for (const pin of [active, selected(active)]) {
      expect(drawsPin('spots-glow', pin)).withContext(pin.status).toBe(true);
    }
    expect(drawsPin('spots-glow', demolished))
      .withContext('a demolished spot gets no bloom')
      .toBe(false);
    expect(layer('spots-glow').filter as unknown)
      .withContext('the glow reuses the one demolished test')
      .toEqual(['!', ['==', ['get', 'status'], 'demolished']]);
  });

  it('cuts a demolished pin out of the roads with black, as the basemap labels are', () => {
    expect(paintFor('spots-body', 'circle-opacity', demolished))
      .withContext('the hollow ring is filled, so the road under it is masked')
      .toBe(1);
    expect(paintFor('spots-body', 'circle-color', demolished))
      .withContext('filled with the ground, so it still reads as hollow')
      .toBe(MAP_PALETTE.ground);
    const mark = layer('spots-demolished-mark').paint as Record<
      string,
      unknown
    >;
    expect(mark['text-color']).toBe(MAP_PALETTE.pinDemolished);
    expect(mark['text-halo-color']).toBe(MAP_PALETTE.ground);
    expect(mark['text-halo-width']).toBe(1.5);
  });

  it('grows the selected pin a step', () => {
    expect(paintFor('spots-body', 'circle-radius', selected(active))).toBe(7.5);
    expect(paintFor('spots-body', 'circle-radius', active)).toBe(6);
  });

  it('draws every standing spot alike: Decision 1 left two states', () => {
    expect(JSON.stringify(SPOT_LAYERS)).not.toContain('unclassified');
    expect(paintFor('spots-glow', 'circle-opacity', active)).toBe(0.5);
    expect(
      (layer('spots-body').paint as Record<string, unknown>)['circle-radius'],
    ).toEqual([
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      7.5,
      6,
    ]);
  });

  it('cuts only the selected pin out of a thick amber ring with a black gap', () => {
    for (const id of ['spots-selected-gap', 'spots-selected']) {
      expect(paintFor(id, 'circle-opacity', active))
        .withContext(id)
        .toBe(0);
      expect(paintFor(id, 'circle-stroke-opacity', active))
        .withContext(`${id} on an unselected pin`)
        .toBe(0);
      expect(paintFor(id, 'circle-stroke-opacity', selected(active)))
        .withContext(`${id} on the selected pin`)
        .toBe(1);
    }
    expect(paintFor('spots-selected-gap', 'circle-stroke-color', active)).toBe(
      MAP_PALETTE.ground,
    );
    const gapOuterEdge =
      (paintFor('spots-selected-gap', 'circle-radius', active) as number) +
      (paintFor('spots-selected-gap', 'circle-stroke-width', active) as number);
    expect(gapOuterEdge)
      .withContext('the gap runs right up to the ring')
      .toBe(SELECTED_RING_RADIUS);
    expect(paintFor('spots-selected', 'circle-radius', active)).toBe(
      SELECTED_RING_RADIUS,
    );
    expect(paintFor('spots-selected', 'circle-stroke-width', active)).toBe(3);
    expect(paintFor('spots-selected', 'circle-stroke-color', active)).toBe(
      MAP_PALETTE.selection,
    );
    expect(SELECTED_RING_RADIUS + 3)
      .withContext('the ring reaches over the glow’s outer edge')
      .toBeGreaterThan(
        paintFor('spots-glow', 'circle-radius', active) as number,
      );
  });

  it('rests the lock-on ring invisible on the amber ring, with nothing to lag its frames', () => {
    const paint = layer('spots-lock-on').paint as Record<string, unknown>;
    expect(paint['circle-radius']).toBe(SELECTED_RING_RADIUS);
    expect(paint['circle-stroke-opacity']).toBe(0);
    expect(paint['circle-stroke-width']).toBe(2);
    expect(paint['circle-stroke-color']).toBe(MAP_PALETTE.selection);
    expect(paint['circle-radius-transition']).toEqual({
      duration: 0,
      delay: 0,
    });
    expect(paint['circle-stroke-opacity-transition']).toEqual({
      duration: 0,
      delay: 0,
    });
    for (const pin of [active, demolished, selected(active)]) {
      expect(drawsPin('spots-lock-on', pin))
        .withContext(`the resting ring draws no ${pin.status} pin`)
        .toBe(false);
    }
    expect(layer('spots-lock-on').filter as unknown).toBe(
      LOCK_ON_AT_REST_FILTER,
    );
  });

  it('lights a hovered pin with a stronger bloom and a thin bright ring', () => {
    const hovered = { ...active, hovered: true };
    expect(paintFor('spots-glow', 'circle-radius', hovered)).toBe(18);
    expect(paintFor('spots-glow', 'circle-opacity', hovered)).toBe(0.85);
    expect(paintFor('spots-glow', 'circle-radius', active)).toBe(14);
    expect(paintFor('spots-hover', 'circle-stroke-opacity', hovered)).toBe(1);
    expect(paintFor('spots-hover', 'circle-stroke-opacity', active)).toBe(0);
    expect(paintFor('spots-hover', 'circle-stroke-width', hovered)).toBe(1);
    expect(paintFor('spots-hover', 'circle-stroke-color', hovered)).toBe(
      MAP_PALETTE.pinHover,
    );
  });

  it('lets a × never take a photo pin’s place', () => {
    expect(
      (layer('spots-demolished-mark').layout as Record<string, unknown>)[
        'text-ignore-placement'
      ],
    ).toBeTrue();
  });
});

describe('PHOTO_PIN_LAYERS', () => {
  const photo = PHOTO_PIN_LAYERS.find((l) => l.id === 'spots-photo')!;
  const flag = PHOTO_PIN_LAYERS.find((l) => l.id === 'spots-flag')!;

  it('draws the flag over the photo pins, both from the spot source', () => {
    expect(PHOTO_PIN_LAYERS.map((l) => l.id)).toEqual([
      'spots-photo',
      'spots-flag',
    ]);
    for (const l of PHOTO_PIN_LAYERS) {
      expect(l.source).withContext(l.id).toBe(SPOT_SOURCE_ID);
    }
  });

  it('gives every spot with a photo a photo pin that yields to a neighbour with more photos', () => {
    expect(photo.filter as unknown).toEqual(HAS_COVER);
    expect(photo.layout as unknown).toEqual(
      jasmine.objectContaining({
        'icon-image': ['concat', 'spot-photo:', ['get', 'id']],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': false,
        'symbol-sort-key': ['-', ['get', 'photoCount']],
      }),
    );
  });

  it('rests the flag on no spot and shows it whatever it overlaps, still keeping others off it', () => {
    expect(flag.filter as unknown).toBe(FLAG_AT_REST_FILTER);
    expect(flag.layout as unknown).toEqual(
      jasmine.objectContaining({
        'icon-image': ['concat', 'spot-flag:', ['get', 'id']],
        'icon-allow-overlap': true,
        'icon-ignore-placement': false,
      }),
    );
  });

  it('points the flag at the selected spot and takes its photo pin away while it flies', () => {
    expect(flagFilter('a') as unknown).toEqual(['==', ['get', 'id'], 'a']);
    expect(flagFilter(null) as unknown).toBe(FLAG_AT_REST_FILTER);
    expect(photoPinFilter('a') as unknown).toEqual([
      'all',
      HAS_COVER,
      ['!=', ['get', 'id'], 'a'],
    ]);
    expect(photoPinFilter(null) as unknown).toEqual(HAS_COVER);
  });
});
