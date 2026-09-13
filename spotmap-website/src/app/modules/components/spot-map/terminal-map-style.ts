import type { StyleSpecification } from 'maplibre-gl';

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

/**
 * Hex mirrors of the CSS custom properties in src/styles.css. A MapLibre style is plain JSON
 * and cannot read custom properties, so the two are kept in step by hand — the comment on each
 * line names the token it mirrors.
 */
export const TERMINAL_PALETTE = {
  bg: '#000000', // --color-bg
  surface: '#0a0f0a', // --color-surface
  surfaceRaised: '#0d160d', // --color-surface-raised
  line: '#0f3d17', // --color-line
  phosphor: '#00ff00', // --color-phosphor
  phosphorBright: '#b6ffb6', // --color-phosphor-bright
  phosphorDim: '#00b800', // --color-phosphor-dim
  phosphorDeep: '#005a00', // --color-phosphor-deep
  amber: '#ffb000', // --color-amber
} as const;

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
        id: 'road-casing',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        paint: {
          'line-color': TERMINAL_PALETTE.phosphorDeep,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            0.6,
            14,
            2,
            18,
            6,
          ],
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
        paint: {
          'line-color': TERMINAL_PALETTE.phosphorDeep,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12,
            0.3,
            14,
            0.8,
            18,
            3,
          ],
        },
      },
      {
        id: 'road-major',
        type: 'line',
        source: BASEMAP_SOURCE_ID,
        'source-layer': 'transportation',
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['motorway', 'trunk', 'primary', 'secondary']],
        ],
        paint: {
          'line-color': TERMINAL_PALETTE.phosphorDim,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            0.5,
            12,
            1.2,
            16,
            3,
            18,
            5,
          ],
        },
      },
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
