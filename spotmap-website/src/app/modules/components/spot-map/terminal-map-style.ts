import type {
  ExpressionSpecification,
  HillshadeLayerSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SourceSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import {
  CONTOUR_ELEVATION_KEY,
  CONTOUR_LEVEL_KEY,
  CONTOUR_MAXZOOM,
  CONTOUR_SOURCE_LAYER,
  type ElevationTiles,
  MAPTERHORN_DEM,
} from './elevation';
import { MAP_PALETTE } from './map-palette';

/** OpenFreeMap's keyless TileJSON for the planet vector tiles the basemap draws. */
export const OPENFREEMAP_TILES = 'https://tiles.openfreemap.org/planet';
/** OpenFreeMap's keyless glyph endpoint, which serves the Noto Sans stacks the labels use. */
export const OPENFREEMAP_GLYPHS =
  'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/**
 * The vector source the OpenFreeMap tiles arrive on; every basemap layer draws from it. It is the
 * one source the map cannot paint without — terrain is decoration — so SpotMapComponent fails the
 * map only when this one never comes up.
 */
export const BASEMAP_SOURCE_ID = 'openmaptiles';

/** The terrain DEM the hillshade reads, served from maplibre-contour's shared cache. */
const DEM_SOURCE_ID = 'dem';

/** The contour lines maplibre-contour generates from the same DEM. */
const CONTOUR_SOURCE_ID = 'contours';

/** The zoom stops every road tier's width ramp runs through. */
const ROAD_ZOOMS = [10, 12, 14, 16, 18];

/** One rung of the road ranking: the classes it draws, in what colour and at what width. */
interface RoadTier {
  /** The layer id this tier draws as. */
  readonly id: string;
  /** `transportation.class` values, as OpenFreeMap serves them (decode table in the spec). */
  readonly classes: readonly string[];
  /** The stroke colour, a MAP_PALETTE road role. */
  readonly color: string;
  /** Stroke width in px, one per ROAD_ZOOMS stop. */
  readonly widths: readonly number[];
  /** The zoom below which the tier is not drawn at all; drawn from the start when absent. */
  readonly minzoom?: number;
}

/**
 * The road ranking, brightest and widest first, up the radar-phosphor afterglow ladder: motorway
 * and trunk carry the city, service roads and tracks barely register, and every road class the
 * Vienna tiles serve lands in exactly one tier. Brightness and width carry the rank between them —
 * never a dash pattern, which breaks a line up until it stops reading as one. Whatever the tiles
 * carry that is not a road — paths, piers, rails, bridge decks, unbuilt roads — is drawn by its
 * own layer below, or not at all.
 */
const ROAD_TIERS: readonly RoadTier[] = [
  {
    id: 'road-major',
    classes: ['motorway', 'trunk'],
    color: MAP_PALETTE.roadMajor,
    widths: [0.8, 1.4, 2.6, 4.5, 7],
  },
  {
    id: 'road-arterial',
    classes: ['primary', 'secondary'],
    color: MAP_PALETTE.roadArterial,
    widths: [0.5, 1, 1.8, 3.2, 5],
  },
  {
    id: 'road-local',
    classes: ['tertiary', 'minor'],
    color: MAP_PALETTE.roadLocal,
    widths: [0.3, 0.6, 1.1, 2.2, 3.6],
  },
  {
    id: 'road-service',
    classes: ['service', 'track', 'busway'],
    color: MAP_PALETTE.roadService,
    widths: [0.15, 0.25, 0.5, 0.9, 1.5],
    minzoom: 13,
  },
];

/** Only the two widest tiers stack and run in parallel often enough to need a casing. */
const CASED_TIERS = ROAD_TIERS.slice(0, 2);

/**
 * How much wider than its fill a casing draws, in px: a black margin either side, so two
 * carriageways running side by side stay two lines.
 */
const ROAD_CASING_HALO = 2;

/**
 * The `transportation.brunnel` values that put a way out of sight. The tiles serve three —
 * `bridge`, `tunnel` and `ford` (decode table in the spec) — and only a tunnel hides anything:
 * a bridge or a ford is right in front of whoever is standing in the street.
 */
const HIDDEN_BRUNNELS: readonly string[] = ['tunnel'];

/**
 * The way is above ground. What a person standing in the street can see is the whole test — which
 * is why the tunnel goes by `brunnel` and not by mode: the U-Bahn on its Gürtel viaduct is a
 * landmark to steer by, the same line underground is not, and neither is a motorway, a garage
 * ramp or a subway passage in a tunnel of its own. Every transportation layer keeps this rule.
 */
const ABOVE_GROUND: ExpressionSpecification = [
  '!',
  ['in', ['get', 'brunnel'], ['literal', [...HIDDEN_BRUNNELS]]],
];

/**
 * Pedestrian streets and piers, plus, for areas, the footway squares OSM maps as polygons:
 * the ground a skater rolls on that is not a road.
 */
function pedestrianGround(
  pathSubclasses: readonly string[],
): ExpressionSpecification {
  return [
    'any',
    [
      'all',
      ['==', ['get', 'class'], 'path'],
      ['in', ['get', 'subclass'], ['literal', [...pathSubclasses]]],
    ],
    ['==', ['get', 'class'], 'pier'],
  ];
}

/** `class` is one of these. */
function classFilter(classes: readonly string[]): ExpressionSpecification {
  return ['in', ['get', 'class'], ['literal', [...classes]]];
}

/** `class` is one of these, and the way is above ground. */
function visibleFilter(classes: readonly string[]): ExpressionSpecification {
  return ['all', classFilter(classes), ABOVE_GROUND];
}

/**
 * Cycleways, pedestrian streets and piers, as lines and only where paved. Footways, steps and
 * trails stay off — they crowded Karlsplatz into a tangle, and a trail is no ground to skate —
 * and so do station platforms and indoor corridors.
 */
const PATH_FILTER: ExpressionSpecification = [
  'all',
  ['==', ['geometry-type'], 'LineString'],
  ABOVE_GROUND,
  pedestrianGround(['cycleway', 'pedestrian']),
  ['!=', ['get', 'surface'], 'unpaved'],
];

/**
 * Squares and piers mapped as areas. They take a quiet fill and never an outline: outlines were
 * most of the Karlsplatz tangle.
 */
const PLAZA_FILTER: ExpressionSpecification = [
  'all',
  ['==', ['geometry-type'], 'Polygon'],
  ABOVE_GROUND,
  pedestrianGround(['pedestrian', 'footway']),
];

/** A linear ramp over zoom through `[zoom, value, zoom, value, …]` stops. */
function zoomRamp(...stops: number[]): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...stops,
  ] as ExpressionSpecification;
}

/** A width ramp across ROAD_ZOOMS. */
function widthRamp(widths: readonly number[]): ExpressionSpecification {
  return zoomRamp(...ROAD_ZOOMS.flatMap((zoom, stop) => [zoom, widths[stop]]));
}

/**
 * The casing ramp: each cased tier's own width plus the halo, chosen per class, because a
 * casing sized for a motorway would give an arterial the weight of one.
 */
function casingRamp(): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...ROAD_ZOOMS.flatMap((zoom, stop) => [
      zoom,
      [
        'match',
        ['get', 'class'],
        ...CASED_TIERS.flatMap((tier) => [
          [...tier.classes],
          tier.widths[stop] + ROAD_CASING_HALO,
        ]),
        0,
      ],
    ]),
  ] as ExpressionSpecification;
}

/** The line layer one road tier draws as: its classes, above ground, in its colour and width. */
function roadLayer(tier: RoadTier): LineLayerSpecification {
  return {
    id: tier.id,
    type: 'line',
    source: BASEMAP_SOURCE_ID,
    'source-layer': 'transportation',
    ...(tier.minzoom === undefined ? {} : { minzoom: tier.minzoom }),
    filter: visibleFilter(tier.classes),
    paint: {
      'line-color': tier.color,
      'line-width': widthRamp(tier.widths),
    },
  };
}

/** Every label's paint: its colour, cut out of the strokes beneath by a black halo. */
function labelPaint(color: string): SymbolLayerSpecification['paint'] {
  return {
    'text-color': color,
    'text-halo-color': MAP_PALETTE.ground,
    'text-halo-width': 1.5,
  };
}

/** The terrain sources: one DEM fetch per tile feeds both the hillshade and the contours. */
function elevationSources(
  elevation: ElevationTiles,
): Record<string, SourceSpecification> {
  return {
    [DEM_SOURCE_ID]: {
      type: 'raster-dem',
      tiles: [elevation.demTiles],
      tileSize: MAPTERHORN_DEM.tileSize,
      encoding: MAPTERHORN_DEM.encoding,
      maxzoom: MAPTERHORN_DEM.maxzoom,
      attribution: MAPTERHORN_DEM.attribution,
    },
    [CONTOUR_SOURCE_ID]: {
      type: 'vector',
      tiles: [elevation.contourTiles],
      maxzoom: CONTOUR_MAXZOOM,
    },
  };
}

/** Relief as a faint blue lift on the sunward slopes; the shaded side stays ground-black. */
function hillshadeLayer(): HillshadeLayerSpecification {
  return {
    id: 'hillshade',
    type: 'hillshade',
    source: DEM_SOURCE_ID,
    paint: {
      'hillshade-exaggeration': 0.5,
      'hillshade-shadow-color': MAP_PALETTE.reliefShadow,
      'hillshade-highlight-color': MAP_PALETTE.reliefHighlight,
      'hillshade-accent-color': MAP_PALETTE.reliefShadow,
    },
  };
}

/** Minor and major contour lines, both solid: weight and brightness tell them apart. */
function contourLineLayers(): LineLayerSpecification[] {
  return [
    {
      id: 'contour-minor',
      type: 'line',
      source: CONTOUR_SOURCE_ID,
      'source-layer': CONTOUR_SOURCE_LAYER,
      filter: ['==', ['get', CONTOUR_LEVEL_KEY], 0],
      paint: { 'line-color': MAP_PALETTE.contourMinor, 'line-width': 0.6 },
    },
    {
      id: 'contour-major',
      type: 'line',
      source: CONTOUR_SOURCE_ID,
      'source-layer': CONTOUR_SOURCE_LAYER,
      filter: ['>=', ['get', CONTOUR_LEVEL_KEY], 1],
      paint: { 'line-color': MAP_PALETTE.contourMajor, 'line-width': 1 },
    },
  ];
}

/** The height in metres along each major contour. */
function contourLabelLayer(): SymbolLayerSpecification {
  return {
    id: 'contour-label',
    type: 'symbol',
    source: CONTOUR_SOURCE_ID,
    'source-layer': CONTOUR_SOURCE_LAYER,
    minzoom: 13,
    filter: ['>=', ['get', CONTOUR_LEVEL_KEY], 1],
    layout: {
      'symbol-placement': 'line',
      'text-field': [
        'concat',
        ['to-string', ['get', CONTOUR_ELEVATION_KEY]],
        ' M',
      ],
      'text-font': ['Noto Sans Regular'],
      'text-size': 9,
      'text-letter-spacing': 0.1,
    },
    paint: labelPaint(MAP_PALETTE.contourLabel),
  };
}

/** One terrain layer, and the basemap layer it is drawn directly beneath. */
export interface ElevationLayer {
  /** The layer to add. */
  readonly layer: LayerSpecification;
  /** The basemap layer id it goes under, as `map.addLayer(layer, beforeId)` takes it. */
  readonly beforeId: string;
}

/**
 * Everything elevation adds to a map that already shows the flat city: the two terrain sources,
 * and the four terrain layers in the order they are to be added.
 */
export interface ElevationAdditions {
  /** The DEM and contour sources, keyed by source id. */
  readonly sources: Readonly<Record<string, SourceSpecification>>;
  /** The terrain layers, each paired with the basemap layer it slots in under. */
  readonly layers: readonly ElevationLayer[];
}

/**
 * The relief and contours for the given terrain tiles, to be added to the flat city once it has
 * loaded. Adding the layers in this order, each before its `beforeId`, draws them exactly where
 * the design places them: the hillshade under the green space, both contour weights under the
 * rail, and the contour heights under the water labels.
 */
export function buildElevationAdditions(
  elevation: ElevationTiles,
): ElevationAdditions {
  return {
    sources: elevationSources(elevation),
    layers: [
      { layer: hillshadeLayer(), beforeId: 'landcover' },
      ...contourLineLayers().map((layer) => ({ layer, beforeId: 'rail' })),
      { layer: contourLabelLayer(), beforeId: 'water-label' },
    ],
  };
}

/**
 * The basemap: the city in the Map Palette — radar-phosphor roads and labels over 3279
 * blue-violet water, with dim fills as decoration. It is drawn flat: relief and contours are
 * added later, from {@link buildElevationAdditions}, so the map never waits on the terrain.
 */
export function buildTerminalStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: OPENFREEMAP_GLYPHS,
    sources: {
      [BASEMAP_SOURCE_ID]: { type: 'vector', url: OPENFREEMAP_TILES },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': MAP_PALETTE.ground },
      },
      {
        // Parks, woods and grass live in `landcover`, not `landuse` (which is the built
        // environment): OpenMapTiles files park, garden and meadow under class `grass`.
        id: 'landcover',
        type: 'fill',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood']]],
        paint: { 'fill-color': MAP_PALETTE.greenSpace },
      },
      {
        id: 'plaza',
        type: 'fill',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        minzoom: 14,
        filter: PLAZA_FILTER,
        paint: { 'fill-color': MAP_PALETTE.plaza },
      },
      {
        id: 'water',
        type: 'fill',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'water',
        paint: { 'fill-color': MAP_PALETTE.waterFill },
      },
      {
        id: 'water-line',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'water',
        paint: {
          'line-color': MAP_PALETTE.waterLine,
          'line-width': zoomRamp(11, 0.6, 16, 1.4),
        },
      },
      {
        // Buildings fade in as a mid-tone block once a block reads as one, and take their
        // outline a zoom later, so the city overview stays a street map.
        id: 'building',
        type: 'fill',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'building',
        minzoom: 14.5,
        paint: {
          'fill-color': MAP_PALETTE.buildingFill,
          'fill-opacity': zoomRamp(14.5, 0, 15.2, 1),
        },
      },
      {
        id: 'building-outline',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'building',
        minzoom: 15.5,
        paint: {
          'line-color': MAP_PALETTE.buildingOutline,
          'line-opacity': zoomRamp(15.5, 0, 16.3, 1),
          'line-width': zoomRamp(16, 0.5, 18, 1),
        },
      },
      {
        // Track a skater crosses or steers by: the tram in the roadway, surface rail, and the
        // U-Bahn wherever it runs in the open — at grade or up on a viaduct, which is a
        // landmark in its own right. Only the underground stretches drop out.
        id: 'rail',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        minzoom: 13,
        filter: visibleFilter(['rail', 'transit']),
        paint: {
          'line-color': MAP_PALETTE.rail,
          'line-opacity': 0.8,
          'line-width': zoomRamp(13, 0.4, 18, 1.2),
        },
      },
      {
        id: 'path',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        minzoom: 14,
        filter: PATH_FILTER,
        paint: {
          'line-color': MAP_PALETTE.path,
          'line-width': zoomRamp(14, 0.5, 18, 1.4),
        },
      },
      {
        // Runs under the two widest tiers only, so that a path or a pier can never inherit
        // road weight from it the way an unfiltered casing hands it out.
        id: 'road-casing',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        filter: visibleFilter(CASED_TIERS.flatMap((tier) => [...tier.classes])),
        paint: {
          'line-color': MAP_PALETTE.roadCasing,
          'line-width': casingRamp(),
        },
      },
      ...[...ROAD_TIERS].reverse().map(roadLayer),
      {
        id: 'water-label',
        type: 'symbol',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'water_name',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Italic'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.2,
          'text-size': 11,
        },
        paint: labelPaint(MAP_PALETTE.waterLabel),
      },
      {
        id: 'street-label',
        type: 'symbol',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation_name',
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
          'text-size': 10.5,
        },
        paint: labelPaint(MAP_PALETTE.streetLabel),
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'place',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.14,
          'text-size': 12.5,
        },
        paint: labelPaint(MAP_PALETTE.placeLabel),
      },
    ],
  };
}
