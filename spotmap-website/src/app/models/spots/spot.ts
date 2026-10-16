/**
 * Pin taxonomy, Decision 1 (2026-10-16): every blue pin, and My Maps' green "New added Spots"
 * marker, is `active`; orange is `demolished`. There is no third state.
 */
export type SpotStatus = 'active' | 'demolished';

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
 * The served attributes of one spot pin — what the bundled `public/spots/<city>.geojson` snapshot
 * and the live `city_spots()` query both carry, built by tools/extract-spots/served-record.mjs:
 * its stable id, display name, `SpotStatus`, notes and photo keys. Carried on
 * `SpotFeature.properties` and rendered by `SpotPopupComponent`.
 */
export interface SpotProperties {
  /** The extraction's re-extraction-stable id, e.g. `hbf-curb-99f6e5`. */
  id: string;
  name: string;
  status: SpotStatus;
  /** The spot's notes from My Maps, verbatim (may contain newlines); null when it has none. */
  notes: string | null;
  /**
   * Photo object keys under the photo host, `<city>/<file>.webp`, in gallery order — keys, never
   * URLs: `photoUrl()` turns one into a thumbnail or full-size URL.
   */
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
 * The GeoJSON `FeatureCollection` of a city's spots: the live `city_spots()` answer, or the
 * bundled `spots/{city}.geojson` snapshot promoted from data/spots/ by
 * tools/extract-spots/promote.mjs — the same shape either way. The collection
 * `SpotsService.loadSpots()` ends with; `SpotMapComponent` feeds it straight into MapLibre as the pins
 * source.
 */
export interface SpotCollection {
  type: 'FeatureCollection';
  features: SpotFeature[];
}
