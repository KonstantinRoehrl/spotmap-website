import type {
  ExpressionSpecification,
  LineLayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { TERMINAL_PALETTE } from './map-palette';

export const OPENFREEMAP_TILES = 'https://tiles.openfreemap.org/planet';
export const OPENFREEMAP_GLYPHS =
  'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const SPOT_SOURCE_ID = 'spots';
export const SPOT_HIT_LAYER_ID = 'spots-hit';
export const SPOT_GLOW_LAYER_ID = 'spots-glow';
export const SPOT_BODY_LAYER_ID = 'spots-body';
export const SPOT_SELECTED_LAYER_ID = 'spots-selected';

/** The vector source the OpenFreeMap tiles arrive on; every basemap layer draws from it. */
const BASEMAP_SOURCE_ID = 'openmaptiles';

/** The zoom stops every road tier's width ramp runs through. */
const ROAD_ZOOMS = [10, 12, 14, 16, 18];

interface RoadTier {
  readonly id: string;
  /** `transportation.class` values, as OpenFreeMap serves them (decode table in the spec). */
  readonly classes: readonly string[];
  readonly color: string;
  /**
   * Over the true-black ground, opacity is a brightness step — and the palette holds only two
   * greens below the phosphor the spot pins own, which is fewer than the ranking needs.
   */
  readonly opacity: number;
  /** Stroke width in px, one per ROAD_ZOOMS stop. */
  readonly widths: readonly number[];
  readonly minzoom?: number;
}

/**
 * The road ranking, brightest and widest first: motorway and trunk carry the city, service
 * roads and tracks barely register, and every road class the Vienna tiles serve lands in
 * exactly one tier. Whatever the tiles carry that is not a road — footways, piers, rails,
 * bridge decks, unbuilt roads — is drawn by its own layer below, or not at all.
 */
const ROAD_TIERS: readonly RoadTier[] = [
  {
    id: 'road-major',
    classes: ['motorway', 'trunk'],
    color: TERMINAL_PALETTE.phosphorDim,
    opacity: 1,
    widths: [0.8, 1.4, 2.6, 4.5, 7],
  },
  {
    id: 'road-arterial',
    classes: ['primary', 'secondary'],
    color: TERMINAL_PALETTE.phosphorDim,
    opacity: 0.68,
    widths: [0.5, 1, 1.8, 3.2, 5],
  },
  {
    id: 'road-local',
    classes: ['tertiary', 'minor'],
    color: TERMINAL_PALETTE.phosphorDeep,
    opacity: 1,
    widths: [0.3, 0.6, 1.1, 2.2, 3.6],
  },
  {
    id: 'road-service',
    classes: ['service', 'track', 'busway'],
    color: TERMINAL_PALETTE.phosphorDeep,
    opacity: 0.72,
    widths: [0.2, 0.3, 0.7, 1.4, 2.4],
    minzoom: 13,
  },
];

/** Only the two widest tiers stack and run in parallel often enough to need a casing. */
const CASED_TIERS = ROAD_TIERS.slice(0, 2);

/** How much wider than its fill a casing draws, in px. */
const ROAD_CASING_HALO = 1.4;

/**
 * The `transportation.brunnel` values that put a way out of sight. The tiles serve three —
 * `bridge`, `tunnel` and `ford` (decode table in the spec) — and only a tunnel hides anything:
 * a bridge or a ford is right in front of whoever is standing in the street.
 */
const HIDDEN_BRUNNELS: readonly string[] = ['tunnel'];

/** `class` is one of these. */
function classFilter(classes: readonly string[]): ExpressionSpecification {
  return ['in', ['get', 'class'], ['literal', [...classes]]];
}

/**
 * `class` is one of these, the way is above ground, and `subclass` is none of those. What a
 * person standing in the street can see is the whole test — which is why the tunnel goes by
 * `brunnel` and not by mode: the U-Bahn on its Gürtel viaduct is a landmark to steer by, the
 * same line underground is not, and neither is a motorway, a garage ramp or a subway passage
 * in a tunnel of its own.
 */
function visibleFilter(
  classes: readonly string[],
  hiddenSubclasses: readonly string[] = [],
): ExpressionSpecification {
  const clauses: ExpressionSpecification[] = [
    classFilter(classes),
    ['!', ['in', ['get', 'brunnel'], ['literal', [...HIDDEN_BRUNNELS]]]],
  ];
  if (hiddenSubclasses.length > 0) {
    clauses.push([
      '!',
      ['in', ['get', 'subclass'], ['literal', [...hiddenSubclasses]]],
    ]);
  }
  return ['all', ...clauses] as ExpressionSpecification;
}

/** A width ramp across ROAD_ZOOMS. */
function widthRamp(widths: readonly number[]): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...ROAD_ZOOMS.flatMap((zoom, stop) => [zoom, widths[stop]]),
  ] as ExpressionSpecification;
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
      'line-opacity': tier.opacity,
      'line-width': widthRamp(tier.widths),
    },
  };
}

/** The basemap: a phosphor wireframe of the city, not a recoloured street map. */
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
        paint: { 'background-color': TERMINAL_PALETTE.bg },
      },
      {
        id: 'water',
        type: 'fill',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'water',
        paint: { 'fill-color': TERMINAL_PALETTE.surface },
      },
      {
        // Parks, woods and grass live in `landcover`, not `landuse` (which is the built
        // environment): OpenMapTiles files park, garden and meadow under class `grass`.
        id: 'landcover',
        type: 'fill',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood']]],
        paint: { 'fill-color': TERMINAL_PALETTE.surfaceRaised },
      },
      {
        id: 'building',
        type: 'fill',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'building',
        paint: { 'fill-color': TERMINAL_PALETTE.bg },
      },
      {
        id: 'building-outline',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'building',
        paint: {
          'line-color': TERMINAL_PALETTE.line,
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.2, 18, 0.8],
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
          'line-color': TERMINAL_PALETTE.line,
          'line-opacity': 0.5,
          'line-dasharray': [1, 3],
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.3, 18, 1],
        },
      },
      {
        // Footways, steps, cycleways, pedestrian plazas and piers: ground a skater can roll
        // on, so they stay on the map — a hairline below street weight, never at it. Station
        // platforms and indoor corridors are transit furniture and stay off.
        id: 'path',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        minzoom: 14,
        filter: visibleFilter(['path', 'pier'], ['platform', 'corridor']),
        paint: {
          'line-color': TERMINAL_PALETTE.line,
          'line-opacity': 0.75,
          'line-dasharray': [3, 2],
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 1.4],
        },
      },
      {
        // Runs under the two widest tiers only, so that a footway or a pier can never inherit
        // road weight from it the way an unfiltered casing hands it out.
        id: 'road-casing',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        filter: visibleFilter(CASED_TIERS.flatMap((tier) => [...tier.classes])),
        paint: {
          'line-color': TERMINAL_PALETTE.line,
          'line-width': casingRamp(),
        },
      },
      ...[...ROAD_TIERS].reverse().map(roadLayer),
      {
        id: 'street-label',
        type: 'symbol',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation_name',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
          'text-size': 10,
        },
        paint: {
          'text-color': TERMINAL_PALETTE.phosphorDim,
          'text-halo-color': TERMINAL_PALETTE.bg,
          'text-halo-width': 1,
        },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'place',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
          'text-size': 12,
        },
        paint: {
          'text-color': TERMINAL_PALETTE.phosphor,
          'text-halo-color': TERMINAL_PALETTE.bg,
          'text-halo-width': 1,
        },
      },
    ],
  };
}
