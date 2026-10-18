import type { SpotStatus } from '../spots/spot';

/** A position on the map in degrees, WGS 84: what the satellite picker emits and the RPCs take. */
export interface LngLat {
  /** Longitude, −180 to 180. */
  lng: number;
  /** Latitude, −90 to 90. */
  lat: number;
}

/**
 * One spot as the admin RPCs return it (`admin_spot_json` in the maintainer-tool migration), key
 * for key: deleted spots included, photos as object keys in their display order.
 */
export interface AdminSpot {
  /** The stable spot id, e.g. `hbf-curb-99f6e5`. */
  id: string;
  /** The city slug the spot belongs to, e.g. `vienna`. */
  city: string;
  /** The display name. */
  name: string;
  /** Whether the spot still exists. */
  status: SpotStatus;
  /** Longitude in degrees. */
  lng: number;
  /** Latitude in degrees. */
  lat: number;
  /** Free-text notes, or null when there are none. */
  notes: string | null;
  /** Object keys `<city>/<spot-id>-<8 hex>.webp`, first photo first; empty when none. */
  photos: string[];
  /** When the spot was soft-deleted (timestamptz text), or null while it is live. */
  deletedAt: string | null;
  /** When the spot last changed (timestamptz text). */
  updatedAt: string;
}

/** Why `admin_nearby_spots` returned a spot: within 25 m, or the same name within 100 m. */
export type NearbyMatch = 'position' | 'name';

/**
 * One duplicate candidate from `admin_nearby_spots`, key for key, nearest first: a spot the new
 * photos may belong to instead of a new spot.
 */
export interface NearbySpot {
  /** The candidate's spot id. */
  id: string;
  /** The candidate's city slug. */
  city: string;
  /** The candidate's display name. */
  name: string;
  /** The candidate's status. */
  status: SpotStatus;
  /** Longitude in degrees. */
  lng: number;
  /** Latitude in degrees. */
  lat: number;
  /** Great-circle distance from the picked position, in metres. */
  distanceM: number;
  /** How many photos the candidate already has. */
  photoCount: number;
  /** Whether the candidate is soft-deleted (attaching to it restores it first). */
  deleted: boolean;
  /** Which rule made it a candidate. */
  match: NearbyMatch;
}

/** What the create-or-attach flow collects for a new spot; the id is derived from name and position. */
export interface NewSpotFields {
  /** The city slug the spot is created in. */
  city: string;
  /** The display name; must not be blank. */
  name: string;
  /** The spot's status. */
  status: SpotStatus;
  /** Free-text notes, or null for none. */
  notes: string | null;
  /** The position picked on the satellite imagery (never the EXIF guess as such). */
  position: LngLat;
}

/** The fields the spot editor may change; an absent key stays as it is. */
export interface SpotPatch {
  /** A new display name; must not be blank. */
  name?: string;
  /** A new status. */
  status?: SpotStatus;
  /** New notes, or null to clear them. */
  notes?: string | null;
  /** A new position, moved on the satellite picker. */
  position?: LngLat;
}
