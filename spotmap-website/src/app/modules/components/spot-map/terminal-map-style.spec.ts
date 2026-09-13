import {
  buildTerminalStyle,
  OPENFREEMAP_GLYPHS,
  OPENFREEMAP_TILES,
  TERMINAL_PALETTE,
} from './terminal-map-style';

/**
 * The class values OpenFreeMap actually serves, decoded from the real z14 tiles over Vienna
 * centre/Stadtpark, the Prater, Schoenbrunn, the Donaupark and the Lobau
 * (`https://tiles.openfreemap.org/planet/20260906_080001_pt/14/{x}/{y}.pbf`). In the
 * OpenMapTiles schema `landuse` carries the built environment only; park, grass and wood
 * arrive in `landcover`, where park sits under class `grass`. `transportation` comes from the
 * same decode run widened to the whole city (z14 x 8932-8943, y 5676-5686, 132 tiles).
 */
const SERVED_CLASSES: Record<string, readonly string[]> = {
  landcover: ['farmland', 'grass', 'sand', 'wetland', 'wood'],
  landuse: [
    'commercial',
    'education',
    'hospital',
    'industrial',
    'kindergarten',
    'library',
    'military',
    'neighbourhood',
    'pitch',
    'playground',
    'railway',
    'residential',
    'retail',
    'school',
    'stadium',
    'suburb',
    'theme_park',
    'track',
    'university',
    'zoo',
  ],
  park: ['historic', 'nature_monument', 'nature_reserve', 'protected_area'],
  transportation: [
    'aerialway',
    'bridge',
    'busway',
    'ferry',
    'minor',
    'minor_construction',
    'motorway',
    'path',
    'path_construction',
    'pier',
    'primary',
    'primary_construction',
    'raceway',
    'rail',
    'secondary',
    'secondary_construction',
    'service',
    'service_construction',
    'tertiary',
    'tertiary_construction',
    'track',
    'transit',
    'trunk',
  ],
};

/**
 * `transportation.subclass`, from the same decode. Footway, steps, cycleway, pedestrian and
 * platform are subclasses of class `path` — not classes of their own — and tram, subway and
 * light rail are subclasses of class `transit`.
 */
const SERVED_SUBCLASSES: readonly string[] = [
  'bridleway',
  'corridor',
  'cycleway',
  'drag_lift',
  'footway',
  'light_rail',
  'narrow_gauge',
  'path',
  'pedestrian',
  'platform',
  'rail',
  'steps',
  'subway',
  'tram',
];

/**
 * `transportation.brunnel`, from the same decode widened to z14 x 8928-8943, y 5676-5686 (176
 * tiles). Three values, and the field is simply absent on the 35847 features that run on plain
 * ground: `bridge` (2803), `tunnel` (2330), `ford` (14). This — not `subclass` — is the field
 * that says "underground": of the 288 `transit`/`subway` segments over Vienna, 121 are tunnels
 * and 167 are not (99 at grade, 68 up on the U6 and U4 viaducts).
 */
const SERVED_BRUNNELS: readonly string[] = ['bridge', 'ford', 'tunnel'];

/** A basemap layer, seen through the handful of fields these tests reason about. */
interface StyleLayer {
  id: string;
  minzoom?: number;
  'source-layer'?: string;
  filter?: unknown;
  paint?: Record<string, unknown>;
}

/** A feature as the tiles deliver it, which is all a filter ever sees. */
interface TileFeature {
  class: string;
  subclass?: string;
  brunnel?: string;
}

/**
 * The values a filter admits and rejects for one property, walking through the `all` and `!`
 * wrappers a two-property filter needs. `['in', ['get', p], ['literal', [...]]]` under a `!`
 * rejects; anywhere else it admits.
 */
function filterValues(
  layer: unknown,
  property: string,
): { admits: string[]; rejects: string[] } {
  const admits: string[] = [];
  const rejects: string[] = [];
  const walk = (node: unknown, negated: boolean): void => {
    if (!Array.isArray(node)) return;
    const [operator, ...operands] = node as unknown[];
    if (operator === '!') {
      for (const operand of operands) walk(operand, !negated);
      return;
    }
    const [target, literal] = operands;
    if (
      operator === 'in' &&
      Array.isArray(target) &&
      target[0] === 'get' &&
      target[1] === property &&
      Array.isArray(literal) &&
      literal[0] === 'literal'
    ) {
      (negated ? rejects : admits).push(...(literal[1] as string[]));
      return;
    }
    for (const operand of operands) walk(operand, negated);
  };
  walk((layer as StyleLayer).filter, false);
  return { admits, rejects };
}

/** The values an `['in', ['get', 'class'], ['literal', [...]]]` filter matches on. */
function filteredClasses(layer: unknown): readonly string[] {
  return filterValues(layer, 'class').admits;
}

/**
 * Whether one tile property gets a feature past a layer's filter: a listed value is admitted, a
 * rejected one is dropped, and a filter that lists nothing for the property admits everything.
 */
function passes(
  layer: StyleLayer,
  property: string,
  value: string | undefined,
): boolean {
  const { admits, rejects } = filterValues(layer, property);
  // A missing property is `null`, which MapLibre's `in` never finds in a literal list.
  if (admits.length > 0 && !admits.includes(value ?? '')) return false;
  return value === undefined || !rejects.includes(value);
}

/** Whether a layer paints this feature. A layer with no class filter paints all of them. */
function draws(layer: StyleLayer, feature: TileFeature): boolean {
  return (['class', 'subclass', 'brunnel'] as const).every((property) =>
    passes(layer, property, feature[property]),
  );
}

/** One stop of a zoom ramp: a width, or a width chosen per class. */
function stopWidth(output: unknown, feature: TileFeature): number {
  if (typeof output === 'number') return output;
  const [operator, input, ...cases] = output as unknown[];
  if (
    operator !== 'match' ||
    !Array.isArray(input) ||
    input[0] !== 'get' ||
    input[1] !== 'class'
  ) {
    throw new Error(`unsupported line-width stop: ${JSON.stringify(output)}`);
  }
  for (let i = 0; i + 1 < cases.length - 1; i += 2) {
    if ((cases[i] as string[]).includes(feature.class))
      return cases[i + 1] as number;
  }
  return cases[cases.length - 1] as number;
}

/** The px stroke a layer gives this feature at this zoom, 0 where the layer is switched off. */
function widthAt(
  layer: StyleLayer,
  feature: TileFeature,
  zoom: number,
): number {
  if (layer.minzoom !== undefined && zoom < layer.minzoom) return 0;
  const width = layer.paint?.['line-width'];
  if (typeof width === 'number') return width;
  const [operator, , input, ...stops] = width as unknown[];
  if (
    operator !== 'interpolate' ||
    !Array.isArray(input) ||
    input[0] !== 'zoom'
  ) {
    throw new Error(`unsupported line-width: ${JSON.stringify(width)}`);
  }
  const ramp: { zoom: number; width: number }[] = [];
  for (let i = 0; i < stops.length; i += 2) {
    ramp.push({
      zoom: stops[i] as number,
      width: stopWidth(stops[i + 1], feature),
    });
  }
  const first = ramp[0];
  const last = ramp[ramp.length - 1];
  if (zoom <= first.zoom) return first.width;
  if (zoom >= last.zoom) return last.width;
  const upper = ramp.findIndex((stop) => stop.zoom >= zoom);
  const from = ramp[upper - 1];
  const to = ramp[upper];
  const share = (zoom - from.zoom) / (to.zoom - from.zoom);
  return from.width + share * (to.width - from.width);
}

/**
 * How bright a stroke reads over the style's true-black ground: relative luminance of the hex,
 * scaled by opacity, which over `#000000` is exactly what compositing does.
 */
function brightnessOf(layer: StyleLayer): number {
  const hex = layer.paint?.['line-color'] as string;
  const opacity = (layer.paint?.['line-opacity'] as number | undefined) ?? 1;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) * opacity;
}

describe('buildTerminalStyle', () => {
  const style = buildTerminalStyle();

  it('sources vector tiles from OpenFreeMap and declares no sprite', () => {
    expect(style.sources['openmaptiles']).toEqual({
      type: 'vector',
      url: OPENFREEMAP_TILES,
    });
    expect(style.glyphs).toBe(OPENFREEMAP_GLYPHS);
    expect(style.sprite).toBeUndefined();
  });

  it('paints a true-black ground', () => {
    const background = style.layers.find((l) => l.id === 'background');
    expect(background).toBeDefined();
    expect(
      (background as { paint: Record<string, unknown> }).paint[
        'background-color'
      ],
    ).toBe('#000000');
  });

  it('uses no white or near-white colour anywhere', () => {
    const serialized = JSON.stringify(style).toLowerCase();
    for (const banned of ['#fff', '#ffffff', 'white', '#fefefe', '#f8f8f8']) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('declares every colour as hex, never oklch', () => {
    expect(JSON.stringify(style)).not.toContain('oklch');
  });

  it('draws water, roads, buildings and street labels', () => {
    const sourceLayers = new Set(
      style.layers
        .map((l) => (l as { 'source-layer'?: string })['source-layer'])
        .filter(Boolean),
    );
    for (const expected of [
      'water',
      'landcover',
      'building',
      'transportation',
      'transportation_name',
      'place',
    ]) {
      expect(sourceLayers).toContain(expected);
    }
  });

  it('paints parks, woods and grass in surface-raised', () => {
    const green = style.layers.find((l) => l.id === 'landcover') as {
      'source-layer'?: string;
      paint: Record<string, unknown>;
    };
    expect(green).toBeDefined();
    expect(green['source-layer']).toBe('landcover');
    expect(filteredClasses(green)).toEqual(['grass', 'wood']);
    expect(green.paint['fill-color']).toBe(TERMINAL_PALETTE.surfaceRaised);
  });

  it('filters green space only on classes the tiles actually serve', () => {
    const greenFills = style.layers.filter(
      (l) =>
        (l as { paint?: Record<string, unknown> }).paint?.['fill-color'] ===
        TERMINAL_PALETTE.surfaceRaised,
    );
    expect(greenFills.length).toBeGreaterThan(0);
    for (const layer of greenFills) {
      const sourceLayer =
        (layer as { 'source-layer'?: string })['source-layer'] ?? '';
      const served = SERVED_CLASSES[sourceLayer] ?? [];
      const filtered = filteredClasses(layer);
      expect(filtered.length)
        .withContext(`${layer.id} matches every feature in ${sourceLayer}`)
        .toBeGreaterThan(0);
      for (const cls of filtered) {
        expect(served)
          .withContext(`${layer.id} filters ${sourceLayer}.class on "${cls}"`)
          .toContain(cls);
      }
    }
  });

  it('draws green space above water and below the buildings', () => {
    const order = style.layers.map((l) => l.id);
    expect(order.indexOf('landcover')).toBeGreaterThan(order.indexOf('water'));
    expect(order.indexOf('landcover')).toBeLessThan(order.indexOf('building'));
  });

  it('labels in an uppercase, letterspaced treatment', () => {
    const label = style.layers.find((l) => l.id === 'street-label') as {
      layout: Record<string, unknown>;
    };
    expect(label.layout['text-transform']).toBe('uppercase');
    expect(label.layout['text-letter-spacing']).toBeGreaterThan(0);
    expect(label.layout['text-font']).toEqual(['Noto Sans Regular']);
  });
});

describe('buildTerminalStyle road hierarchy', () => {
  const style = buildTerminalStyle();
  const transportLayers = style.layers.filter(
    (l) => (l as StyleLayer)['source-layer'] === 'transportation',
  ) as unknown as StyleLayer[];
  const CASING_ID = 'road-casing';

  /** Every road class the Vienna tiles carry, from the widest down to the quietest. */
  const ROAD_CLASSES = [
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'minor',
    'service',
    'track',
    'busway',
  ];

  /** How wide a feature reads: the widest stroke any layer gives it. */
  function drawnWidth(feature: TileFeature, zoom: number): number {
    return Math.max(
      0,
      ...transportLayers
        .filter((l) => draws(l, feature))
        .map((l) => widthAt(l, feature, zoom)),
    );
  }

  /** How bright a feature reads: the brightest stroke any layer gives it. */
  function drawnBrightness(feature: TileFeature): number {
    return Math.max(
      0,
      ...transportLayers.filter((l) => draws(l, feature)).map(brightnessOf),
    );
  }

  function isDrawn(feature: TileFeature): boolean {
    return transportLayers.some(
      (l) => draws(l, feature) && widthAt(l, feature, 18) > 0,
    );
  }

  function label(feature: TileFeature): string {
    const kind = feature.subclass
      ? `${feature.class}/${feature.subclass}`
      : feature.class;
    return feature.brunnel ? `${kind} (${feature.brunnel})` : kind;
  }

  it('filters every road layer on classes, subclasses and brunnels the tiles serve', () => {
    expect(transportLayers.length).toBeGreaterThan(0);
    for (const layer of transportLayers) {
      const classes = filterValues(layer, 'class');
      expect(classes.admits.length)
        .withContext(`${layer.id} draws the whole transportation layer`)
        .toBeGreaterThan(0);
      for (const cls of [...classes.admits, ...classes.rejects]) {
        expect(SERVED_CLASSES['transportation'])
          .withContext(`${layer.id} filters transportation.class on "${cls}"`)
          .toContain(cls);
      }
      const subclasses = filterValues(layer, 'subclass');
      for (const sub of [...subclasses.admits, ...subclasses.rejects]) {
        expect(SERVED_SUBCLASSES)
          .withContext(
            `${layer.id} filters transportation.subclass on "${sub}"`,
          )
          .toContain(sub);
      }
      const brunnels = filterValues(layer, 'brunnel');
      for (const brunnel of [...brunnels.admits, ...brunnels.rejects]) {
        expect(SERVED_BRUNNELS)
          .withContext(
            `${layer.id} filters transportation.brunnel on "${brunnel}"`,
          )
          .toContain(brunnel);
      }
    }
  });

  it('gives every road class the tiles serve exactly one fill', () => {
    for (const cls of ROAD_CLASSES) {
      const fills = transportLayers.filter(
        (l) => l.id !== CASING_ID && draws(l, { class: cls }),
      );
      expect(fills.length)
        .withContext(
          `layers filling ${cls}: [${fills.map((l) => l.id).join(', ')}]`,
        )
        .toBe(1);
    }
  });

  it('ranks the road classes from motorway brightest to service dimmest', () => {
    const ranking = ['motorway', 'secondary', 'minor', 'service'];
    for (let i = 1; i < ranking.length; i++) {
      const brighter = { class: ranking[i - 1] };
      const dimmer = { class: ranking[i] };
      expect(drawnBrightness(brighter))
        .withContext(`${brighter.class} outshines ${dimmer.class}`)
        .toBeGreaterThan(drawnBrightness(dimmer));
      for (const zoom of [14, 16]) {
        expect(drawnWidth(brighter, zoom))
          .withContext(
            `${brighter.class} is wider than ${dimmer.class} at z${zoom}`,
          )
          .toBeGreaterThan(drawnWidth(dimmer, zoom));
      }
    }
  });

  it('draws the classes inside one tier at the same weight', () => {
    const peers: [string, string][] = [
      ['motorway', 'trunk'],
      ['primary', 'secondary'],
      ['tertiary', 'minor'],
      ['service', 'track'],
      ['service', 'busway'],
    ];
    for (const [a, b] of peers) {
      expect(drawnBrightness({ class: a }))
        .withContext(`${a} and ${b} share a brightness`)
        .toBe(drawnBrightness({ class: b }));
      expect(drawnWidth({ class: a }, 14))
        .withContext(`${a} and ${b} share a width`)
        .toBe(drawnWidth({ class: b }, 14));
    }
  });

  it('keeps footways, steps, piers and tram tracks below street weight', () => {
    const quiet: TileFeature[] = [
      { class: 'path', subclass: 'footway' },
      { class: 'path', subclass: 'steps' },
      { class: 'path', subclass: 'cycleway' },
      { class: 'path', subclass: 'pedestrian' },
      { class: 'pier' },
      { class: 'rail', subclass: 'rail' },
      { class: 'transit', subclass: 'tram' },
    ];
    for (const feature of quiet) {
      expect(drawnWidth(feature, 14))
        .withContext(
          `${label(feature)} is thinner than a residential street at z14`,
        )
        .toBeLessThan(drawnWidth({ class: 'minor' }, 14));
      expect(drawnBrightness(feature))
        .withContext(`${label(feature)} is dimmer than a service road`)
        .toBeLessThan(drawnBrightness({ class: 'service' }));
    }
  });

  it('draws footways, steps and plazas, which are terrain a skater reads', () => {
    for (const subclass of [
      'footway',
      'steps',
      'cycleway',
      'pedestrian',
      'path',
    ]) {
      expect(isDrawn({ class: 'path', subclass }))
        .withContext(`path/${subclass} is on the map`)
        .toBe(true);
    }
    expect(isDrawn({ class: 'pier' })).toBe(true);
  });

  it('draws the rail a skater sees, at grade and up on the viaduct', () => {
    const track: TileFeature[] = [
      { class: 'rail', subclass: 'rail' },
      { class: 'rail', subclass: 'rail', brunnel: 'bridge' },
      { class: 'transit', subclass: 'tram' },
      { class: 'transit', subclass: 'light_rail' },
      { class: 'transit', subclass: 'subway' },
      { class: 'transit', subclass: 'subway', brunnel: 'bridge' },
    ];
    for (const feature of track) {
      expect(isDrawn(feature))
        .withContext(`${label(feature)} is on the map`)
        .toBe(true);
    }
  });

  it('leaves everything in a tunnel undrawn, whatever it carries', () => {
    const underground: TileFeature[] = [
      { class: 'transit', subclass: 'subway', brunnel: 'tunnel' },
      { class: 'transit', subclass: 'tram', brunnel: 'tunnel' },
      { class: 'rail', subclass: 'rail', brunnel: 'tunnel' },
      { class: 'motorway', brunnel: 'tunnel' },
      { class: 'primary', brunnel: 'tunnel' },
      { class: 'minor', brunnel: 'tunnel' },
      { class: 'service', brunnel: 'tunnel' },
      { class: 'path', subclass: 'footway', brunnel: 'tunnel' },
      { class: 'path', subclass: 'steps', brunnel: 'tunnel' },
    ];
    for (const feature of underground) {
      expect(isDrawn(feature))
        .withContext(`${label(feature)} stays off the map`)
        .toBe(false);
    }
    expect(drawnWidth({ class: 'motorway', brunnel: 'tunnel' }, 16))
      .withContext('a motorway tunnel gets neither a fill nor a casing')
      .toBe(0);
  });

  it('keeps bridges and fords, which are structure in plain sight', () => {
    const inTheOpen: TileFeature[] = [
      { class: 'motorway', brunnel: 'bridge' },
      { class: 'minor', brunnel: 'bridge' },
      { class: 'path', subclass: 'footway', brunnel: 'bridge' },
      { class: 'path', subclass: 'path', brunnel: 'ford' },
      { class: 'track', brunnel: 'ford' },
    ];
    for (const feature of inTheOpen) {
      expect(isDrawn(feature))
        .withContext(`${label(feature)} is on the map`)
        .toBe(true);
    }
  });

  it('leaves platforms, bridge decks and unbuilt roads undrawn', () => {
    const noise: TileFeature[] = [
      { class: 'path', subclass: 'platform' },
      { class: 'path', subclass: 'corridor' },
      { class: 'bridge' },
      { class: 'primary_construction' },
      { class: 'path_construction' },
      { class: 'aerialway', subclass: 'drag_lift' },
      { class: 'ferry' },
      { class: 'raceway' },
    ];
    for (const feature of noise) {
      expect(isDrawn(feature))
        .withContext(`${label(feature)} stays off the map`)
        .toBe(false);
    }
  });

  it('runs the casing under every road fill and above the quiet ways', () => {
    const order = style.layers.map((l) => l.id);
    const casing = transportLayers.find(
      (l) => l.id === CASING_ID,
    ) as StyleLayer;
    expect(casing).toBeDefined();
    for (const quiet of ['rail', 'path']) {
      expect(order.indexOf(CASING_ID))
        .withContext(`the casing draws above ${quiet}`)
        .toBeGreaterThan(order.indexOf(quiet));
    }
    for (const tier of [
      'road-service',
      'road-local',
      'road-arterial',
      'road-major',
    ]) {
      expect(order.indexOf(tier))
        .withContext(`${tier} draws above the casing`)
        .toBeGreaterThan(order.indexOf(CASING_ID));
    }
    for (const cls of ['motorway', 'primary']) {
      const fill = transportLayers.find(
        (l) => l.id !== CASING_ID && draws(l, { class: cls }),
      ) as StyleLayer;
      expect(widthAt(casing, { class: cls }, 14))
        .withContext(`the ${cls} casing is wider than its fill`)
        .toBeGreaterThan(widthAt(fill, { class: cls }, 14));
      expect(brightnessOf(casing))
        .withContext(`the ${cls} casing is dimmer than its fill`)
        .toBeLessThan(brightnessOf(fill));
    }
  });

  it('leaves the phosphor the spot pins own to the spot pins', () => {
    const spotOnly: string[] = [
      TERMINAL_PALETTE.phosphor,
      TERMINAL_PALETTE.phosphorBright,
    ];
    for (const layer of transportLayers) {
      expect(spotOnly)
        .withContext(`${layer.id} competes with the spot pins`)
        .not.toContain(layer.paint?.['line-color'] as string);
    }
    for (const quiet of ['path', 'rail']) {
      const layer = transportLayers.find((l) => l.id === quiet);
      expect(layer?.paint?.['line-color'])
        .withContext(`${quiet} is drawn as structure, not as road`)
        .toBe(TERMINAL_PALETTE.line);
    }
  });

  it('stays inside the small-style budget the spec sets', () => {
    expect(style.layers.length).toBeLessThanOrEqual(16);
  });
});
