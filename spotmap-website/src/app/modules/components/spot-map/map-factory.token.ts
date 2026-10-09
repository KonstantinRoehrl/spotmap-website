import { InjectionToken } from '@angular/core';
import type {
  Map as MapLibreMap,
  MapOptions,
  Popup as MapLibrePopup,
} from 'maplibre-gl';
import type { ElevationLoader } from './elevation';

/** Builds the MapLibre instance for {@link SpotMapComponent}. */
export type MapFactory = (options: MapOptions) => Promise<MapLibreMap>;

/** Builds the MapLibre popup that frames a tapped spot's details. */
export type PopupFactory = (options: {
  closeButton: boolean;
  maxWidth: string;
  className: string;
}) => Promise<MapLibrePopup>;

/**
 * Declared without a default implementation on purpose: the test target still runs on the
 * webpack karma builder, and a token carrying its own factory would drag the ESM-only
 * maplibre-gl into every spec bundle that touches the map component. The real factory is
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
