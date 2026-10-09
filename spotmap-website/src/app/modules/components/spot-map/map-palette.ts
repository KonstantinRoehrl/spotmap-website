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

/**
 * The Vienna basemap's colour roles: DESIGN.md §2's Map Palette, the one documented exception to
 * the Two-Phosphor Rule. Roads and labels climb a P7 radar-phosphor afterglow ladder, water is
 * IBM 3279 blue-violet, and the area fills, contours and relief stay dim because they are
 * decoration — direct sun on a phone washes out anything dimmer than about `#00b800`, so meaning
 * lives in line brightness, width, labels and pin shape. Roles that are CSS tokens point at
 * {@link TERMINAL_PALETTE} instead of repeating its hex, and no value has all three channels above
 * 200 (the No-White Rule).
 */
export const MAP_PALETTE = {
  ground: TERMINAL_PALETTE.bg,
  waterFill: '#101a58',
  waterLine: '#5a8cff',
  waterLabel: '#7aa2ff',
  greenSpace: '#0b2a14',
  plaza: '#1e2410',
  buildingFill: '#0e1512',
  buildingOutline: '#3f6a50',
  reliefHighlight: '#0d2c44',
  reliefShadow: TERMINAL_PALETTE.bg,
  contourMinor: '#24402f',
  contourMajor: '#4f7f62',
  contourLabel: '#8fc4a4',
  roadMajor: '#d8ff4d',
  roadArterial: '#b0e63c',
  roadLocal: '#7fbf34',
  roadService: '#557f2a',
  path: '#6ee7c8',
  rail: '#92b0a8',
  roadCasing: TERMINAL_PALETTE.bg,
  streetLabel: '#c8f060',
  placeLabel: '#e8ffb8',
  pinActive: TERMINAL_PALETTE.phosphor,
  pinDemolished: TERMINAL_PALETTE.phosphorDim,
  selection: TERMINAL_PALETTE.amber,
} as const;
