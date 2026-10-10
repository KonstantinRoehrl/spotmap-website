/** Pin taxonomy. `unclassified` is the KML's green group, whose meaning is Decision 1's call. */
export type SpotStatus = 'active' | 'demolished' | 'unclassified';

/**
 * One map's record of a spot, kept so the extraction drops nothing: the folder and notes of the
 * placemark on that map and, for a map other than the city's own, where that map puts the pin
 * and how it names and colours it when that differs. Written by `tools/extract-spots`.
 */
export interface SpotSource {
  /** Map slug from `data/spots/sources.json`, never a URL or a map id. */
  map: string;
  /** The placemark's folder path on that map, folder names joined by `" / "`. */
  folder?: string;
  /** The placemark's notes as plain text; may contain newlines. */
  description?: string;
  /** `[lng, lat]` on that map; extra maps only (the spot's own geometry is its main map's). */
  position?: [number, number];
  /** That map's name for the spot, only when it differs from the spot's name. */
  name?: string;
  /** That map's pin status, only when it differs from the spot's status. */
  status?: SpotStatus;
}

/**
 * The non-geometric attributes of one spot pin: its stable id, display name, `SpotStatus`
 * classification, photo asset paths and per-map `SpotSource` records — carried on
 * `SpotFeature.properties` and rendered by `SpotPopupComponent`.
 */
export interface SpotProperties {
  id: string;
  name: string;
  status: SpotStatus;
  /** Base-relative asset paths, never a leading slash — production runs under /spotmap-website/. */
  photos: string[];
  /**
   * One record per map that holds the spot, the city's own map first. Optional because the
   * promoted `public/spots/` datasets predate it.
   */
  sources?: SpotSource[];
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
