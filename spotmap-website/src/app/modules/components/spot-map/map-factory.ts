import type { MapFactory } from './map-factory.token';

/** Loads maplibre-gl on first use, keeping it out of the initial route chunk. */
export const createMapLibreMap: MapFactory = async (options) => {
  const { Map } = await import('maplibre-gl');
  return new Map(options);
};
