import { InjectionToken } from '@angular/core';
import type { Map as MapLibreMap, MapOptions } from 'maplibre-gl';
import type { ElevationLoader } from './elevation';

/** Builds the MapLibre instance for {@link SpotMapComponent}. */
export type MapFactory = (options: MapOptions) => Promise<MapLibreMap>;

/**
 * Declared without a default implementation on purpose: a token carrying its own factory would
 * pull maplibre-gl into every spec bundle that touches the map component. The real factory is
 * registered in app.config.ts; specs provide a fake.
 */
export const MAP_FACTORY = new InjectionToken<MapFactory>('MAP_FACTORY');

/**
 * Declared without a default for the same reason as {@link MAP_FACTORY}: the real loader imports
 * maplibre-contour and maplibre-gl. Registered in app.config.ts; specs provide a fake.
 */
export const ELEVATION_LOADER = new InjectionToken<ElevationLoader>(
  'ELEVATION_LOADER',
);
