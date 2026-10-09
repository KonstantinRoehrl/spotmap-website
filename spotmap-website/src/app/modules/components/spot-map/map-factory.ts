import { createElevationLoader, type ElevationLoader } from './elevation';
import type { MapFactory } from './map-factory.token';

/** Loads maplibre-gl on first use, keeping it out of the initial route chunk. */
export const createMapLibreMap: MapFactory = async (options) => {
  const { Map } = await import('maplibre-gl');
  return new Map(options);
};

/**
 * How long a build waits on the terrain library before giving up on relief and leaving its map
 * flat. The map, its pins and `ready` never wait on it — the terrain is added after `load` — so
 * this only bounds how late relief may still appear: long enough for a phone to fetch two lazy
 * chunks on a slow connection.
 */
const ELEVATION_TIMEOUT_MS = 4000;

/**
 * The page's elevation loader: imports maplibre-contour and maplibre-gl on first use and registers
 * the terrain protocols once. The one place, beside the map factories, that imports the libraries
 * for real.
 */
export const loadElevation: ElevationLoader = createElevationLoader(
  {
    maplibre: () => import('maplibre-gl'),
    contour: () => import('maplibre-contour'),
  },
  ELEVATION_TIMEOUT_MS,
);
