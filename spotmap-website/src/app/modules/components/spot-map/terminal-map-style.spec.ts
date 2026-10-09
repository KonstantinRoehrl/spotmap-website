import type { StyleSpecification } from 'maplibre-gl';
import { MAPTERHORN_DEM, type ElevationTiles } from './elevation';
import { MAP_PALETTE, TERMINAL_PALETTE } from './map-palette';
import {
  buildElevationAdditions,
  buildTerminalStyle,
  type ElevationAdditions,
  OPENFREEMAP_GLYPHS,
  OPENFREEMAP_TILES,
} from './terminal-map-style';

/** Stand-in tile URLs in the shape maplibre-contour hands out. */
const ELEVATION: ElevationTiles = {
  demTiles: 'dem-shared://{z}/{x}/{y}',
  contourTiles: 'dem-contour://{z}/{x}/{y}?thresholds=11*50*100',
};

/** Every layer id, in draw order, of the basemap once elevation is added to it (spec §3.2). */
const DRAW_ORDER = [
  'background',
  'hillshade',
  'landcover',
  'plaza',
  'water',
  'water-line',
  'building',
  'building-outline',
  'contour-minor',
  'contour-major',
  'rail',
  'path',
  'road-casing',
  'road-service',
  'road-local',
  'road-arterial',
  'road-major',
  'contour-label',
  'water-label',
  'street-label',
  'place-label',
];

/** The layers drawn only once elevation is added. */
const ELEVATION_LAYERS = [
  'hillshade',
  'contour-minor',
  'contour-major',
  'contour-label',
];

/**
 * The style as the map holds it once elevation is added: the terrain sources merged in, and each
 * terrain layer inserted before its `beforeId` the way `map.addLayer(layer, beforeId)` does. A
 * `beforeId` the basemap does not draw throws, where MapLibre would drop the layer with an error.
 */
function withElevation(
  style: StyleSpecification,
  additions: ElevationAdditions,
): StyleSpecification {
  const layers = [...style.layers];
  for (const { layer, beforeId } of additions.layers) {
    const at = layers.findIndex((l) => l.id === beforeId);
    if (at === -1) {
      throw new Error(
        `no basemap layer "${beforeId}" to put ${layer.id} under`,
      );
    }
    layers.splice(at, 0, layer);
  }
  return {
    ...style,
    sources: { ...style.sources, ...additions.sources },
    layers,
  };
}

/** The basemap with elevation added, the way a map ends up holding it once relief arrives. */
function elevatedStyle(): StyleSpecification {
  return withElevation(
    buildTerminalStyle(),
    buildElevationAdditions(ELEVATION),
  );
}

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
  type: string;
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
  surface?: string;
  /** How the tile encodes the feature; ways arrive as lines unless a test says otherwise. */
  geometry?: 'LineString' | 'Polygon';
}

/**
 * Evaluates the slice of MapLibre's expression language these filters use — `all`, `any`, `!`,
 * `in`, `==`, `!=`, `get`, `literal` and `geometry-type` — against one tile feature, and throws on
 * anything else, so a filter that grows a new operator cannot pass by being misread. A missing
 * property reads `null`, as in MapLibre: `in` never finds it and `!=` always holds.
 */
function evaluate(expression: unknown, feature: TileFeature): unknown {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression as unknown[];
  switch (operator) {
    case 'all':
      return args.every((arg) => evaluate(arg, feature) === true);
    case 'any':
      return args.some((arg) => evaluate(arg, feature) === true);
    case '!':
      return evaluate(args[0], feature) !== true;
    case 'in':
      return (evaluate(args[1], feature) as unknown[]).includes(
        evaluate(args[0], feature),
      );
    case '==':
      return evaluate(args[0], feature) === evaluate(args[1], feature);
    case '!=':
      return evaluate(args[0], feature) !== evaluate(args[1], feature);
    case 'get':
      return feature[args[0] as keyof TileFeature] ?? null;
    case 'literal':
      return args[0];
    case 'geometry-type':
      return feature.geometry ?? 'LineString';
    default:
      throw new Error(
        `unsupported filter operator: ${JSON.stringify(operator)}`,
      );
  }
}

/** Whether a layer paints this feature. A layer with no filter paints all of them. */
function draws(layer: StyleLayer, feature: TileFeature): boolean {
  return layer.filter === undefined || evaluate(layer.filter, feature) === true;
}

/**
 * Every value a layer's filter compares one property against — through `in` with a literal list,
 * or `==` / `!=` with a single value — wherever in the filter it sits.
 */
function filterValues(layer: unknown, property: string): string[] {
  const values: string[] = [];
  const reads = (node: unknown) =>
    Array.isArray(node) && node[0] === 'get' && node[1] === property;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    const [operator, target, operand] = node as unknown[];
    if (
      operator === 'in' &&
      reads(target) &&
      Array.isArray(operand) &&
      operand[0] === 'literal'
    ) {
      values.push(...(operand[1] as string[]));
    } else if (
      (operator === '==' || operator === '!=') &&
      reads(target) &&
      typeof operand === 'string'
    ) {
      values.push(operand);
    }
    for (const child of node) walk(child);
  };
  walk((layer as StyleLayer).filter);
  return values;
}

/** WCAG relative luminance of a hex colour drawn at this opacity over true black. */
function luminanceOf(hex: string, opacity = 1): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    // Over `#000000`, compositing at an opacity just scales each channel.
    const channel = (parseInt(hex.slice(i, i + 2), 16) / 255) * opacity;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of that colour against the black ground. */
function contrastOnBlack(hex: string, opacity = 1): number {
  return (luminanceOf(hex, opacity) + 0.05) / 0.05;
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
  // Most cases judge the whole map — basemap and terrain together — so a colour or a dash on a
  // terrain layer is held to the same rules as the rest.
  const style = elevatedStyle();

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
      'water_name',
    ]) {
      expect(sourceLayers).toContain(expected);
    }
  });

  it('paints parks, woods and grass in the green-space fill', () => {
    const green = style.layers.find((l) => l.id === 'landcover') as {
      'source-layer'?: string;
      paint: Record<string, unknown>;
    };
    expect(green).toBeDefined();
    expect(green['source-layer']).toBe('landcover');
    expect(filterValues(green, 'class')).toEqual(['grass', 'wood']);
    expect(green.paint['fill-color']).toBe(MAP_PALETTE.greenSpace);
  });

  it('filters green space only on classes the tiles actually serve', () => {
    const greenFills = style.layers.filter(
      (l) =>
        (l as { paint?: Record<string, unknown> }).paint?.['fill-color'] ===
        MAP_PALETTE.greenSpace,
    );
    expect(greenFills.length).toBeGreaterThan(0);
    for (const layer of greenFills) {
      const sourceLayer =
        (layer as { 'source-layer'?: string })['source-layer'] ?? '';
      const served = SERVED_CLASSES[sourceLayer] ?? [];
      const filtered = filterValues(layer, 'class');
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

  it('draws green space under the water, and both under the buildings', () => {
    const order = style.layers.map((l) => l.id);
    expect(order.indexOf('landcover')).toBeLessThan(order.indexOf('water'));
    expect(order.indexOf('water')).toBeLessThan(order.indexOf('building'));
  });

  it('labels in an uppercase, letterspaced treatment', () => {
    const label = style.layers.find((l) => l.id === 'street-label') as {
      layout: Record<string, unknown>;
    };
    expect(label.layout['text-transform']).toBe('uppercase');
    expect(label.layout['text-letter-spacing']).toBeGreaterThan(0);
    expect(label.layout['text-font']).toEqual(['Noto Sans Regular']);
  });

  it('cuts every basemap label out of the strokes with a black halo', () => {
    for (const id of ['water-label', 'street-label', 'place-label']) {
      const label = style.layers.find((l) => l.id === id) as {
        layout: Record<string, unknown>;
        paint: Record<string, unknown>;
      };
      expect(label).withContext(id).toBeDefined();
      expect(label.layout['text-transform']).withContext(id).toBe('uppercase');
      expect(label.layout['text-letter-spacing'])
        .withContext(id)
        .toBeGreaterThan(0);
      expect(label.paint['text-halo-color']).withContext(id).toBe('#000000');
      expect(label.paint['text-halo-width']).withContext(id).toBe(1.5);
    }
  });

  it('runs street names along their street', () => {
    const label = style.layers.find((l) => l.id === 'street-label') as {
      layout: Record<string, unknown>;
    };
    expect(label.layout['symbol-placement']).toBe('line');
  });

  it('draws the layers in the order the design sets once elevation is added', () => {
    expect(style.layers.map((l) => l.id)).toEqual(DRAW_ORDER);
  });

  it('builds the flat city, with no terrain source or layer, for the map to open on', () => {
    const flat = buildTerminalStyle();
    expect(Object.keys(flat.sources)).toEqual(['openmaptiles']);
    expect(flat.layers.map((l) => l.id)).toEqual(
      DRAW_ORDER.filter((id) => !ELEVATION_LAYERS.includes(id)),
    );
    expect(flat.layers.length).toBe(17);
  });

  it('slots each terrain layer under the basemap layer the design sets', () => {
    const additions = buildElevationAdditions(ELEVATION);
    expect(Object.keys(additions.sources)).toEqual(['dem', 'contours']);
    expect(
      additions.layers.map(({ layer, beforeId }) => [layer.id, beforeId]),
    ).toEqual([
      ['hillshade', 'landcover'],
      ['contour-minor', 'rail'],
      ['contour-major', 'rail'],
      ['contour-label', 'water-label'],
    ]);
  });

  it('reads the DEM and contour tiles from the elevation it is handed', () => {
    expect(style.sources['dem']).toEqual({
      type: 'raster-dem',
      tiles: [ELEVATION.demTiles],
      tileSize: 512,
      encoding: 'terrarium',
      maxzoom: 14,
      attribution: MAPTERHORN_DEM.attribution,
    });
    expect(style.sources['contours']).toEqual({
      type: 'vector',
      tiles: [ELEVATION.contourTiles],
      maxzoom: 15,
    });
  });

  it('credits Mapterhorn, BEV and Copernicus wherever terrain is drawn', () => {
    for (const credit of ['Mapterhorn', 'BEV', 'Copernicus GLO-30']) {
      expect(MAPTERHORN_DEM.attribution).toContain(credit);
    }
  });

  it('fades buildings in by zoom, and their outlines in a zoom later', () => {
    const fill = style.layers.find(
      (l) => l.id === 'building',
    ) as unknown as StyleLayer;
    const outline = style.layers.find(
      (l) => l.id === 'building-outline',
    ) as unknown as StyleLayer;
    expect(fill.minzoom).toBe(14.5);
    expect(fill.paint?.['fill-opacity']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      14.5,
      0,
      15.2,
      1,
    ]);
    expect(outline.minzoom).toBe(15.5);
    expect(outline.paint?.['line-opacity']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      15.5,
      0,
      16.3,
      1,
    ]);
    expect(outline.paint?.['line-width']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      16,
      0.5,
      18,
      1,
    ]);
  });

  it('draws no line dashed or dotted', () => {
    for (const layer of style.layers as unknown as StyleLayer[]) {
      expect(layer.paint?.['line-dasharray'])
        .withContext(`${layer.id} is broken up`)
        .toBeUndefined();
    }
  });

  it('fills squares and piers mapped as areas, and never outlines them', () => {
    const plaza = style.layers.find(
      (l) => l.id === 'plaza',
    ) as unknown as StyleLayer;
    const areas: [TileFeature, boolean][] = [
      [{ class: 'path', subclass: 'pedestrian', geometry: 'Polygon' }, true],
      [{ class: 'path', subclass: 'footway', geometry: 'Polygon' }, true],
      [{ class: 'pier', geometry: 'Polygon' }, true],
      [{ class: 'path', subclass: 'pedestrian' }, false],
      [{ class: 'path', subclass: 'cycleway', geometry: 'Polygon' }, false],
      [
        {
          class: 'path',
          subclass: 'pedestrian',
          geometry: 'Polygon',
          brunnel: 'tunnel',
        },
        false,
      ],
    ];
    for (const [feature, filled] of areas) {
      expect(draws(plaza, feature))
        .withContext(JSON.stringify(feature))
        .toBe(filled);
    }
    expect(Object.keys(plaza.paint ?? {})).toEqual(['fill-color']);
  });

  it('paints no colour with all three channels above 200', () => {
    const hexes = [...JSON.stringify(style).matchAll(/#[0-9a-f]{6}/gi)].map(
      (match) => match[0],
    );
    hexes.push(...Object.values(MAP_PALETTE));
    for (const hex of hexes) {
      const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(channels.every((channel) => channel > 200))
        .withContext(`${hex} reads as white`)
        .toBeFalse();
    }
  });
});

describe('buildTerminalStyle road hierarchy', () => {
  const style = buildTerminalStyle();
  const transportLayers = style.layers.filter(
    (l) =>
      (l as StyleLayer).type === 'line' &&
      (l as StyleLayer)['source-layer'] === 'transportation',
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
      expect(classes.length)
        .withContext(`${layer.id} draws the whole transportation layer`)
        .toBeGreaterThan(0);
      for (const cls of classes) {
        expect(SERVED_CLASSES['transportation'])
          .withContext(`${layer.id} filters transportation.class on "${cls}"`)
          .toContain(cls);
      }
      for (const sub of filterValues(layer, 'subclass')) {
        expect(SERVED_SUBCLASSES)
          .withContext(
            `${layer.id} filters transportation.subclass on "${sub}"`,
          )
          .toContain(sub);
      }
      for (const brunnel of filterValues(layer, 'brunnel')) {
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

  it('keeps paths, piers and track thinner than a residential street', () => {
    // Brightness no longer ranks them: path and rail are brighter than a service road by
    // design, so that they read as their own thing. Width still keeps them below the streets.
    const quiet: TileFeature[] = [
      { class: 'path', subclass: 'cycleway' },
      { class: 'path', subclass: 'pedestrian' },
      { class: 'pier' },
      { class: 'rail', subclass: 'rail' },
      { class: 'transit', subclass: 'tram' },
    ];
    for (const feature of quiet) {
      for (const zoom of [14, 16, 18]) {
        expect(drawnWidth(feature, zoom))
          .withContext(
            `${label(feature)} is thinner than a residential street at z${zoom}`,
          )
          .toBeLessThan(drawnWidth({ class: 'minor' }, zoom));
      }
    }
  });

  it('draws paved cycleways, pedestrian streets and piers, and no other path', () => {
    const rolled: TileFeature[] = [
      { class: 'path', subclass: 'cycleway' },
      { class: 'path', subclass: 'pedestrian' },
      { class: 'pier' },
      { class: 'path', subclass: 'cycleway', surface: 'paved' },
    ];
    for (const feature of rolled) {
      expect(isDrawn(feature))
        .withContext(`${label(feature)} is on the map`)
        .toBe(true);
    }
    const crowding: TileFeature[] = [
      { class: 'path', subclass: 'footway' },
      { class: 'path', subclass: 'steps' },
      { class: 'path', subclass: 'path' },
      { class: 'path', subclass: 'bridleway' },
      { class: 'path', subclass: 'cycleway', surface: 'unpaved' },
      { class: 'pier', surface: 'unpaved' },
      { class: 'path', subclass: 'pedestrian', geometry: 'Polygon' },
    ];
    for (const feature of crowding) {
      expect(isDrawn(feature))
        .withContext(
          `${label(feature)}${feature.surface ? ` (${feature.surface})` : ''}${feature.geometry ? ` as ${feature.geometry}` : ''} stays off the line layers`,
        )
        .toBe(false);
    }
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
      { class: 'path', subclass: 'cycleway', brunnel: 'tunnel' },
      { class: 'path', subclass: 'pedestrian', brunnel: 'tunnel' },
      { class: 'pier', brunnel: 'tunnel' },
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
      { class: 'path', subclass: 'pedestrian', brunnel: 'bridge' },
      { class: 'path', subclass: 'cycleway', brunnel: 'ford' },
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
  });

  it('stays inside the small-style budget the spec sets', () => {
    // Raised from 16 when elevation arrived: hillshade, two contour weights and contour labels,
    // with plazas, the shoreline and water labels, bring the basemap to 21 of these 24 once the
    // terrain is added. The spot layers are added at runtime too, and are not counted here.
    expect(elevatedStyle().layers.length).toBeLessThanOrEqual(24);
  });
});

describe('buildTerminalStyle sun legibility', () => {
  // Direct sun on a glossy phone screen washes out anything dimmer than about #00b800, so every
  // line that carries meaning has to clear WCAG's non-text 3 : 1 against the black ground and
  // every label the text 4.5 : 1. Area fills, contour lines and relief are decoration, exempt.
  const layers = elevatedStyle().layers as unknown as StyleLayer[];
  const paintOf = (id: string): Record<string, unknown> => {
    const layer = layers.find((l) => l.id === id);
    expect(layer).withContext(`${id} exists`).toBeDefined();
    return layer?.paint ?? {};
  };

  it('draws every road, path, rail and shoreline at 3 : 1 or better', () => {
    for (const id of [
      'road-major',
      'road-arterial',
      'road-local',
      'road-service',
      'path',
      'rail',
      'water-line',
    ]) {
      const paint = paintOf(id);
      const opacity = (paint['line-opacity'] as number | undefined) ?? 1;
      expect(contrastOnBlack(paint['line-color'] as string, opacity))
        .withContext(id)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('sets every label at 4.5 : 1 or better', () => {
    for (const id of [
      'street-label',
      'place-label',
      'water-label',
      'contour-label',
    ]) {
      expect(contrastOnBlack(paintOf(id)['text-color'] as string))
        .withContext(id)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('paints every pin colour at 3 : 1 or better', () => {
    for (const role of ['pinActive', 'pinDemolished', 'selection'] as const) {
      expect(contrastOnBlack(MAP_PALETTE[role]))
        .withContext(role)
        .toBeGreaterThanOrEqual(3);
    }
  });
});
