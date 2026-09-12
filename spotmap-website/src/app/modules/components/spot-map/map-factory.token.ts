import { InjectionToken } from '@angular/core';
import type { Map as MapLibreMap, MapOptions } from 'maplibre-gl';

/** Builds the MapLibre instance for {@link SpotMapComponent}. */
export type MapFactory = (options: MapOptions) => Promise<MapLibreMap>;

/**
 * Declared without a default implementation on purpose: the test target still runs on the
 * webpack karma builder, and a token carrying its own factory would drag the ESM-only
 * maplibre-gl into every spec bundle that touches the map component. The real factory is
 * registered in app.config.ts; specs provide a fake.
 */
export const MAP_FACTORY = new InjectionToken<MapFactory>('MAP_FACTORY');
