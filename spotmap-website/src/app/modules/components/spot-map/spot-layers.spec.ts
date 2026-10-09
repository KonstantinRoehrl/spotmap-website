import { MAP_PALETTE } from './map-palette';
import {
  LOCK_ON_AT_REST_FILTER,
  SELECTED_RING_RADIUS,
  SPOT_LAYERS,
  SPOT_SOURCE_ID,
} from './spot-layers';

/** A spot as the pin layers see it: its id, its status, and whether it is the selected one. */
interface Pin {
  id: string;
  status: 'active' | 'unclassified' | 'demolished';
  selected: boolean;
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
      return args[0] === 'selected' ? pin.selected : null;
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
const unclassified: Pin = { id: 'u', status: 'unclassified', selected: false };
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
    expect(paintFor('spots-body', 'circle-radius', unclassified))
      .withContext('an unclassified dot is smaller than an active one')
      .toBeLessThan(paintFor('spots-body', 'circle-radius', active) as number);
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
    for (const pin of [active, unclassified, selected(active)]) {
      expect(drawsPin('spots-glow', pin)).withContext(pin.status).toBe(true);
    }
    expect(drawsPin('spots-glow', demolished))
      .withContext('a demolished spot gets no bloom')
      .toBe(false);
    expect(layer('spots-glow').filter as unknown)
      .withContext('the glow reuses the one demolished test')
      .toEqual(['!', ['==', ['get', 'status'], 'demolished']]);
    expect(paintFor('spots-glow', 'circle-opacity', unclassified))
      .withContext('an unclassified spot glows weaker than an active one')
      .toBeLessThan(paintFor('spots-glow', 'circle-opacity', active) as number);
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
    expect(
      paintFor('spots-body', 'circle-radius', selected(unclassified)),
    ).toBe(6);
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
});
