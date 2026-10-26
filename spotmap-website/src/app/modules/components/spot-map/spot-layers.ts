import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FilterSpecification,
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

/** The thin bright ring round a pin that a pointer, or its list row, hovers. */
export const SPOT_HOVER_LAYER_ID = 'spots-hover';

/** A spot's first photo, framed on a stem above its pin, wherever there is room for it. */
export const SPOT_PHOTO_LAYER_ID = 'spots-photo';

/** The layers a pointer can hit, thumb target only: the dot, on a map with no photo host. */
export const PIN_TARGET_LAYER_IDS: readonly string[] = [SPOT_HIT_LAYER_ID];

/**
 * The layers a pointer can hit on a map with photo pins: the photo frames reach well above the
 * 22 px thumb target, and a tap on one is a tap on its spot. The raised flag is drawn over the map,
 * not on it, so the component checks it before asking about these.
 */
export const PHOTO_PIN_TARGET_LAYER_IDS: readonly string[] = [
  SPOT_PHOTO_LAYER_ID,
  SPOT_HIT_LAYER_ID,
];

/** The image id of a spot's photo pin is this prefix and the spot id. */
export const PHOTO_PIN_IMAGE_PREFIX = 'spot-photo:';

/**
 * The dot footprints: an invisible, collision-only symbol on every spot, so a resting photo pin is
 * placed only where its frame covers no other spot's dot, and the basemap labels keep off the dots
 * too. Its id.
 */
export const SPOT_FOOTPRINT_LAYER_ID = 'spots-footprint';

/** The footprint's image id: one transparent square shared by every spot. */
export const SPOT_FOOTPRINT_IMAGE_ID = 'spot-footprint';

/**
 * The footprint's side, in px: the largest resting dot, the demolished ring (a 6 px radius and a
 * 2 px stroke outside it), with a 2 px margin all round. Not the bloom: a frame over a dot's glow
 * but clear of the dot itself hides nothing.
 */
export const FOOTPRINT_SIZE_PX = 20;

/**
 * The photo pin's collision padding, `[top, right, bottom, left]` in px. The 2 px MapLibre gives by
 * default on three sides; at the bottom, -6 lifts the box's foot off all but the last 2 px of the
 * 8 px stem band. The box then ends 14 px above the pin's centre, clear of the pin's own 20 px
 * footprint, which ends 10 px above it. So a spot's own dot never blocks its own photo, while every
 * other spot's dot does.
 */
export const PHOTO_PIN_COLLISION_PADDING: [number, number, number, number] = [
  2, 2, -6, 2,
];

/**
 * The footprint's image: a transparent {@link FOOTPRINT_SIZE_PX} square. Nothing is drawn, so pixel
 * ratio 1 is enough: only its size counts, and MapLibre sizes a symbol's collision box by its image.
 */
export function spotFootprintImage(): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  return {
    width: FOOTPRINT_SIZE_PX,
    height: FOOTPRINT_SIZE_PX,
    data: new Uint8Array(FOOTPRINT_SIZE_PX * FOOTPRINT_SIZE_PX * 4),
  };
}

/**
 * The footprint layer, on every spot. It is always placed and never drawn (`icon-allow-overlap`,
 * opacity 0), yet it still enters the collision index (`icon-ignore-placement: false`). It is added
 * last, on top of every other layer, so MapLibre, which places the top layer first, places it
 * before any photo pin or label: those are then kept off the dots.
 */
export const SPOT_FOOTPRINT_LAYER: SymbolLayerSpecification = {
  id: SPOT_FOOTPRINT_LAYER_ID,
  type: 'symbol',
  source: SPOT_SOURCE_ID,
  layout: {
    'icon-image': SPOT_FOOTPRINT_IMAGE_ID,
    'icon-allow-overlap': true,
    'icon-ignore-placement': false,
    'icon-padding': 0,
  },
  paint: {
    'icon-opacity': 0,
  },
};

/** How far above the pin's centre a pin image's foot sits, in px: clear of the selected 7.5 px dot. */
export const PIN_IMAGE_LIFT_PX = 8;

/**
 * True for a spot with at least one photo, as an expression `all` can nest: MapLibre's types only
 * let `all` take expressions or legacy filters, and a `FilterSpecification` may be either.
 */
const HAS_COVER_EXPRESSION: ExpressionSpecification = [
  '!=',
  ['get', 'cover'],
  null,
];

/** True for a spot with at least one photo: the list shape's `cover` is its first photo's key. */
export const HAS_COVER: FilterSpecification = HAS_COVER_EXPRESSION;

/**
 * The photo pins' filter: every spot with a photo but those in `hidden`, the spots a selection flag
 * stands in for. `SelectionFlag` sets it, and owns when: a pin goes once its flag stands on it and
 * comes back once its flag has fallen back into it.
 */
export function photoPinFilter(hidden: readonly string[]): FilterSpecification {
  return hidden.length === 0
    ? HAS_COVER
    : [
        'all',
        HAS_COVER_EXPRESSION,
        ['!', ['in', ['get', 'id'], ['literal', [...hidden]]]],
      ];
}
/** Where the amber ring sits, in px — and where the lock-on pulse comes to rest. */
export const SELECTED_RING_RADIUS = 11.5;

/**
 * The lock-on ring's filter at rest: it matches no pin, so the ring draws nothing until
 * startLockOn() points it at the selected one.
 */
export const LOCK_ON_AT_REST_FILTER: FilterSpecification = false;

/** True for the one pin carrying the `selected` feature state. */
const IS_SELECTED: ExpressionSpecification = [
  'boolean',
  ['feature-state', 'selected'],
  false,
];

/** True for the pin carrying the `hovered` feature state. */
const IS_HOVERED: ExpressionSpecification = [
  'boolean',
  ['feature-state', 'hovered'],
  false,
];

/** True for a spot whose `status` property is `demolished`. */
const IS_DEMOLISHED: ExpressionSpecification = [
  '==',
  ['get', 'status'],
  'demolished',
];

/**
 * The spot pins, drawn in paint order. Status reads by shape, so it survives every kind of colour
 * vision: a filled dot with a glow is active and a hollow ring with a × is demolished — the only
 * two states since Decision 1 made My Maps' green marker active. Selection leans on no hue either — under deuteranopia
 * phosphor and amber collapse to the same ochre — so a black gap cuts the pin out of a thick amber
 * ring drawn over the glow's outer edge. The hit layer comes first so its transparent circle is
 * the thumb target under everything visible. A hovered pin's bloom strengthens and a thin
 * `phosphor-bright` ring circles it, from the `hovered` feature state the page sets for a hovered
 * pin or list row.
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
    filter: ['!', IS_DEMOLISHED],
    paint: {
      'circle-radius': ['case', IS_HOVERED, 18, 14],
      'circle-blur': 1,
      'circle-color': MAP_PALETTE.pinActive,
      'circle-opacity': ['case', IS_HOVERED, 0.85, 0.5],
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
    filter: LOCK_ON_AT_REST_FILTER,
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
      'circle-radius': ['case', IS_SELECTED, 7.5, 6],
      // A demolished ring is filled with the ground, not left empty: it still reads as hollow on
      // the black basemap, and it masks the road that would otherwise run through it.
      'circle-color': [
        'case',
        IS_DEMOLISHED,
        MAP_PALETTE.ground,
        MAP_PALETTE.pinActive,
      ],
      'circle-opacity': 1,
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
    // Between the dot and the amber ring, thin, so hover never reads as selection.
    id: SPOT_HOVER_LAYER_ID,
    type: 'circle',
    source: SPOT_SOURCE_ID,
    paint: {
      'circle-radius': 9.5,
      'circle-color': MAP_PALETTE.ground,
      'circle-opacity': 0,
      'circle-stroke-width': 1,
      'circle-stroke-color': MAP_PALETTE.pinHover,
      'circle-stroke-opacity': ['case', IS_HOVERED, 1, 0],
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
      // It never collides away a photo pin: the photo pins sit above it.
      'text-ignore-placement': true,
    },
    // The same black halo as the basemap labels, so the × stays legible where it crosses a road.
    paint: {
      'text-color': MAP_PALETTE.pinDemolished,
      'text-halo-color': MAP_PALETTE.ground,
      'text-halo-width': 1.5,
    },
  },
];

/**
 * The photo pins, added on top of {@link SPOT_LAYERS} only when a photo host is configured, and
 * under {@link SPOT_FOOTPRINT_LAYER}. MapLibre places the top layer first: the dot footprints, then
 * the photo pins, which claim room before the basemap labels but only where they cover no dot;
 * where two photos would overlap, the one with more photos wins (`symbol-sort-key` ascends) and
 * the other stays a dot. Images are drawn by `PhotoPins` on demand. The selected spot's flag is not
 * a layer: `SelectionFlag` draws it over the map, so it needs no room of its own.
 */
export const PHOTO_PIN_LAYERS: readonly SymbolLayerSpecification[] = [
  {
    id: SPOT_PHOTO_LAYER_ID,
    type: 'symbol',
    source: SPOT_SOURCE_ID,
    filter: HAS_COVER,
    layout: {
      'icon-image': ['concat', PHOTO_PIN_IMAGE_PREFIX, ['get', 'id']],
      'icon-anchor': 'bottom',
      'icon-offset': [0, -PIN_IMAGE_LIFT_PX],
      'icon-allow-overlap': false,
      'icon-ignore-placement': false,
      'icon-padding': PHOTO_PIN_COLLISION_PADDING,
      'symbol-sort-key': ['-', ['get', 'photoCount']],
    },
  },
];
