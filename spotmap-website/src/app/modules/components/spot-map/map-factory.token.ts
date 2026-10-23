import { InjectionToken } from '@angular/core';
import type {
  Map as MapLibreMap,
  MapOptions,
  Popup as MapLibrePopup,
} from 'maplibre-gl';
import type { ElevationLoader } from './elevation';
import type { PopupAnchor } from './popup-fit';

/** Builds the MapLibre instance for {@link SpotMapComponent}. */
export type MapFactory = (options: MapOptions) => Promise<MapLibreMap>;

/**
 * Builds the MapLibre popup that frames a tapped spot's details. The options go to MapLibre's
 * `Popup` untouched: a fixed `anchor` so the side never flips while the camera moves, and MapLibre's
 * own close button and close-on-click off, because both remove the popup at once and the map
 * closes it with an animation instead.
 */
export type PopupFactory = (options: {
  anchor: PopupAnchor;
  closeButton: boolean;
  closeOnClick: boolean;
  maxWidth: string;
  className: string;
}) => Promise<MapLibrePopup>;

/**
 * Declared without a default implementation on purpose: a token carrying its own factory would
 * pull maplibre-gl into every spec bundle that touches the map component. The real factory is
 * registered in app.config.ts; specs provide a fake.
 */
export const MAP_FACTORY = new InjectionToken<MapFactory>('MAP_FACTORY');

/** Declared without a default for the same reason as {@link MAP_FACTORY}. */
export const POPUP_FACTORY = new InjectionToken<PopupFactory>('POPUP_FACTORY');

/**
 * Declared without a default for the same reason as {@link MAP_FACTORY}: the real loader imports
 * maplibre-contour and maplibre-gl. Registered in app.config.ts; specs provide a fake.
 */
export const ELEVATION_LOADER = new InjectionToken<ElevationLoader>(
  'ELEVATION_LOADER',
);
