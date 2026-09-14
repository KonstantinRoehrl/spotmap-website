/** Pin taxonomy. `unclassified` is the KML's green group, whose meaning is Decision 1's call. */
export type SpotStatus = 'active' | 'demolished' | 'unclassified';

/**
 * The non-geometric attributes of one spot pin: its stable id, display name, `SpotStatus`
 * classification, and photo asset paths — carried on `SpotFeature.properties` and rendered
 * by `SpotPopupComponent`.
 */
export interface SpotProperties {
  id: string;
  name: string;
  status: SpotStatus;
  /** Base-relative asset paths, never a leading slash — production runs under /spotmap-website/. */
  photos: string[];
}

/**
 * A single spot as a GeoJSON `Point` Feature (one KML placemark from the original Google My
 * Maps export). Consumed directly by `SpotPopupComponent`, and, as a member of a
 * `SpotCollection`, drawn onto the map by `SpotMapComponent`.
 */
export interface SpotFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SpotProperties;
}

/**
 * The GeoJSON `FeatureCollection` of a city's spots, served as the static asset
 * `spots/{city}.geojson` and fetched by `SpotsService.loadSpots()`; `SpotMapComponent` feeds
 * it straight into MapLibre as the pins source.
 */
export interface SpotCollection {
  type: 'FeatureCollection';
  features: SpotFeature[];
}
