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
 * The served attributes of one spot pin — what the live `city_spots()` query returns and
 * the bundled `public/spots/<city>.geojson` snapshot (exported from it by `npm run snapshot:supabase`) carries:
 * its stable id, display name, `SpotStatus`, notes and photo keys. Carried on
 * `SpotFeature.properties` and rendered by `SpotPopupComponent`. This is the full shape; the pins and
 * the list read the lighter {@link SpotListProperties}, and an opened spot the {@link SpotDetail}.
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
 * bundled `spots/{city}.geojson` snapshot exported from the database by
 * `npm run snapshot:supabase` — the same shape either way. The collection
 * `SpotsService.loadSpots()` ends with; `SpotMapComponent` feeds it straight into MapLibre as the pins
 * source.
 */
export interface SpotCollection {
  type: 'FeatureCollection';
  features: SpotFeature[];
}

/**
 * The light fields of one spot that its pin and its list row need: the list shape `city_spot_list()`
 * serves for a whole city, which leaves out the notes and the full photo list. The bundled snapshot
 * keeps the full shape; `toListFeature()` derives this one from it.
 */
export interface SpotListProperties {
  /** The extraction's re-extraction-stable id, as in {@link SpotProperties.id}. */
  id: string;
  name: string;
  status: SpotStatus;
  /** The first photo's object key in gallery order, or null when the spot has no photos. */
  cover: string | null;
  /** How many photos the spot has; 0 without photos. */
  photoCount: number;
}

/** One spot in the list shape, as a GeoJSON `Point` Feature: what the pins and the list draw. */
export interface SpotListFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SpotListProperties;
}

/**
 * A city's spots in the list shape: the live `city_spot_list()` answer, or the bundled snapshot
 * mapped through `toListCollection()`. `SpotsService.loadSpotList()` ends with it.
 */
export interface SpotListCollection {
  type: 'FeatureCollection';
  features: SpotListFeature[];
}

/**
 * One spot's full record, fetched when it is opened: the live `spot_detail()` answer, or the
 * snapshot's feature mapped through `toSpotDetail()`. `city` is what resolves a cold `/spot/<id>`
 * link to the city whose map must open.
 */
export interface SpotDetail {
  id: string;
  /** The city slug the spot belongs to, a `CityEnum` value when the app knows the city. */
  city: string;
  name: string;
  status: SpotStatus;
  /** The spot's notes verbatim (may contain newlines); null when it has none. */
  notes: string | null;
  /** Every photo object key, `<city>/<file>.webp`, in gallery order — keys, never URLs. */
  photos: string[];
  /** `[longitude, latitude]` in degrees. */
  coordinates: [number, number];
}
