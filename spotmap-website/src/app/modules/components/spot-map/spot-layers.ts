import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import { MAP_PALETTE } from './map-palette';

/** The GeoJSON source the spots arrive on, each spot's id promoted to its feature id. */
export const SPOT_SOURCE_ID = 'spots';

/** The invisible thumb target: 22 px, while the visible pin stays small. */
export const SPOT_HIT_LAYER_ID = 'spots-hit';

/** The phosphor bloom behind a standing pin. */
export const SPOT_GLOW_LAYER_ID = 'spots-glow';

/** The black knockout between a selected pin and its amber ring. */
export const SPOT_SELECTED_GAP_LAYER_ID = 'spots-selected-gap';

/** The amber ring around the selected pin. */
export const SPOT_SELECTED_LAYER_ID = 'spots-selected';

/** The ring the lock-on pulse closes in on the selected pin; invisible at rest. */
export const SPOT_LOCK_ON_LAYER_ID = 'spots-lock-on';

/** The pin itself. */
export const SPOT_BODY_LAYER_ID = 'spots-body';

/** The × over a demolished spot's hollow ring. */
export const SPOT_DEMOLISHED_MARK_LAYER_ID = 'spots-demolished-mark';

/** Where the amber ring sits, in px — and where the lock-on pulse comes to rest. */
export const SELECTED_RING_RADIUS = 11.5;

/** True for the one pin carrying the `selected` feature state. */
export const IS_SELECTED: ExpressionSpecification = [
  'boolean',
  ['feature-state', 'selected'],
  false,
];

/** True for a spot whose `status` property is `demolished`. */
const IS_DEMOLISHED: ExpressionSpecification = [
  '==',
  ['get', 'status'],
  'demolished',
];

/** True for a spot whose `status` property is `unclassified`. */
const IS_UNCLASSIFIED: ExpressionSpecification = [
  '==',
  ['get', 'status'],
  'unclassified',
];

/**
 * The spot pins, drawn in paint order. Status reads by shape, so it survives every kind of colour
 * vision: a filled dot with a glow is active, a smaller dot with a weaker glow is unclassified,
 * and a hollow ring with a × is demolished. Selection leans on no hue either — under deuteranopia
 * phosphor and amber collapse to the same ochre — so a black gap cuts the pin out of a thick amber
 * ring drawn over the glow's outer edge. The hit layer comes first so its transparent circle is
 * the thumb target under everything visible.
 */
export const SPOT_LAYERS: readonly (
  CircleLayerSpecification | SymbolLayerSpecification
)[] = [
  {
    id: SPOT_HIT_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': 22,
      'circle-color': MAP_PALETTE.ground,
      'circle-opacity': 0,
    },
  },
  {
    id: SPOT_GLOW_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    filter: ['!=', ['get', 'status'], 'demolished'],
    paint: {
      'circle-radius': 14,
      'circle-blur': 1,
      'circle-color': MAP_PALETTE.pinActive,
      'circle-opacity': ['case', IS_UNCLASSIFIED, 0.28, 0.5],
    },
  },
  {
    // Its 3.5 px stroke runs from 8 px out to the amber ring's inner edge at 11.5 px.
    id: SPOT_SELECTED_GAP_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': 8,
      'circle-color': MAP_PALETTE.ground,
      'circle-opacity': 0,
      'circle-stroke-width': 3.5,
      'circle-stroke-color': MAP_PALETTE.ground,
      'circle-stroke-opacity': ['case', IS_SELECTED, 1, 0],
    },
  },
  {
    id: SPOT_SELECTED_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': SELECTED_RING_RADIUS,
      'circle-color': MAP_PALETTE.ground,
      'circle-opacity': 0,
      'circle-stroke-width': 3,
      'circle-stroke-color': MAP_PALETTE.selection,
      'circle-stroke-opacity': ['case', IS_SELECTED, 1, 0],
    },
  },
  {
    // Driven frame by frame by startLockOn(); a paint transition would trail every frame by
    // MapLibre's default 300 ms, so both animated properties switch instantly.
    id: SPOT_LOCK_ON_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': SELECTED_RING_RADIUS,
      'circle-radius-transition': { duration: 0, delay: 0 },
      'circle-color': MAP_PALETTE.ground,
      'circle-opacity': 0,
      'circle-stroke-width': 2,
      'circle-stroke-color': MAP_PALETTE.selection,
      'circle-stroke-opacity': 0,
      'circle-stroke-opacity-transition': { duration: 0, delay: 0 },
    },
  },
  {
    id: SPOT_BODY_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': [
        'case',
        IS_UNCLASSIFIED,
        ['case', IS_SELECTED, 6, 4.5],
        ['case', IS_SELECTED, 7.5, 6],
      ],
      'circle-color': MAP_PALETTE.pinActive,
      'circle-opacity': ['case', IS_DEMOLISHED, 0, 1],
      'circle-stroke-width': ['case', IS_DEMOLISHED, 2, 1.5],
      'circle-stroke-color': [
        'case',
        IS_DEMOLISHED,
        MAP_PALETTE.pinDemolished,
        MAP_PALETTE.ground,
      ],
    },
  },
  {
    id: SPOT_DEMOLISHED_MARK_LAYER_ID,
    type: 'symbol',
    source: SPOT_SOURCE_ID,
    filter: IS_DEMOLISHED,
    layout: {
      'text-field': '×',
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': MAP_PALETTE.pinDemolished },
  },
];
