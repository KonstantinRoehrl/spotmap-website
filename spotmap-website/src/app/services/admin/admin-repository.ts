import { inject, Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminSpot,
  LngLat,
  NearbySpot,
  NewSpotFields,
  SpotPatch,
} from '../../models/admin/admin-spot';
import { PHOTO_RENDITIONS, type PhotoRendition } from '../spot-photos.service';
import { AdminSession } from './admin-session';
import { photoKey } from './photo-pipeline/hashing';
import type { ProcessedPhoto } from './photo-pipeline/photo-pipeline';
import { spotId } from './spot-id';

/**
 * Why a repository call failed, phrased for what the maintainer can do about it:
 * - `forbidden`: signed out, the session expired, or the account is not an admin (`42501`,
 *   HTTP 401/403);
 * - `conflict`: something with that id or key already exists (`23505`, HTTP 409);
 * - `invalid`: the database refused the input (`P0001` validation messages, `22P02`, HTTP 400);
 * - `network`: no response arrived (offline, or the client library failed to load);
 * - `unknown`: anything else, such as a server fault.
 */
export type AdminRepositoryErrorKind =
  'forbidden' | 'conflict' | 'invalid' | 'network' | 'unknown';

/**
 * A failed admin read or write. The message names the action and carries the server's own
 * message, which for validation errors is the SQL function's `raise` text. The `kind` lets the UI
 * choose its wording.
 */
export class AdminRepositoryError extends Error {
  /**
   * Set when a spot write failed with an unknown outcome that could not be settled either way: the
   * id of the spot it may have created or changed. Passing it back to
   * {@link AdminRepository.createSpotWithPhotos} resumes that create instead of starting a second
   * spot beside a possibly committed one.
   */
  readonly pendingSpotId?: string;

  /**
   * @param kind the failure class
   * @param message the maintainer-facing explanation
   * @param options `cause` carries the PostgREST or Storage error; `pendingSpotId` names a spot
   *   whose write may or may not have landed
   */
  constructor(
    readonly kind: AdminRepositoryErrorKind,
    message: string,
    options?: ErrorOptions & { pendingSpotId?: string },
  ) {
    super(message, options);
    this.name = 'AdminRepositoryError';
    this.pendingSpotId = options?.pendingSpotId;
  }
}

/** The public bucket both renditions of every photo live in. */
export const PHOTO_BUCKET = 'spot-photos';

/**
 * Upload options for a rendition. Seven days of caching is safe because content-named objects
 * never change. `upsert: false` turns a re-upload into a harmless "already exists".
 */
const UPLOAD_OPTIONS = {
  contentType: 'image/webp',
  cacheControl: '604800',
  upsert: false,
} as const;

/** The fields of a PostgREST error this file reads. */
interface PostgrestFailure {
  code?: string;
  message: string;
}

/** The fields of a supabase-js Storage error this file reads (StorageApiError / StorageUnknownError). */
interface StorageFailure {
  name?: string;
  message: string;
  status?: number;
  statusCode?: string;
  originalError?: unknown;
}

/**
 * Notes as the RPCs expect them: blank or whitespace-only notes become `null`. The writers accept
 * only their exact keys, so `notes` is always sent and is never `''`.
 */
function blankToNull(notes: string | null): string | null {
  return notes !== null && notes.trim() !== '' ? notes : null;
}

/**
 * The photos of a batch that still need a key: the first of any repeated `hash8` (the same photo
 * picked twice) and none whose key the spot already holds. Order is preserved, so a repeated pick
 * can never make the RPC fail on a duplicate key.
 *
 * @param photos the processed batch, in display order
 * @param keyOf the object key a photo would get
 * @param existingKeys keys the target spot already has; empty for a new spot
 */
function newPhotos(
  photos: readonly ProcessedPhoto[],
  keyOf: (photo: ProcessedPhoto) => string,
  existingKeys: readonly string[],
): ProcessedPhoto[] {
  const seen = new Set(existingKeys);
  return photos.filter((photo) => {
    const key = keyOf(photo);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The Storage path of one rendition of a photo key, e.g. `full/vienna/x-1a2b3c4d.webp`. */
function objectPath(size: PhotoRendition, key: string): string {
  return `${size}/${key}`;
}

/** Classifies a PostgREST error by its SQLSTATE first and its HTTP status second. */
function postgrestKind(
  error: PostgrestFailure,
  status: number,
): AdminRepositoryErrorKind {
  const code = error.code ?? '';
  if (
    code === '42501' ||
    code.startsWith('PGRST3') ||
    status === 401 ||
    status === 403
  ) {
    return 'forbidden';
  }
  if (code === '23505' || status === 409) {
    return 'conflict';
  }
  if (code === 'P0001' || code === '22P02' || status === 400) {
    return 'invalid';
  }
  return status === 0 ? 'network' : 'unknown';
}

/** Classifies a Storage error by its HTTP status, or as `network` when fetch itself failed. */
function storageKind(error: StorageFailure): AdminRepositoryErrorKind {
  if (error.originalError instanceof TypeError) {
    return 'network';
  }
  if (error.status === 401 || error.status === 403) {
    return 'forbidden';
  }
  if (isDuplicate(error)) {
    return 'conflict';
  }
  return error.status === 400 || error.status === 413 || error.status === 415
    ? 'invalid'
    : 'unknown';
}

/**
 * Whether a failed RPC left the write's outcome unknown: no response arrived (`network`), or the
 * reply was not a verdict from the database (`unknown`, e.g. a gateway fault). The server may have
 * committed either way. Every other kind is a definite rejection, so nothing was written.
 */
function isUnknownOutcome(error: unknown): error is AdminRepositoryError {
  return (
    error instanceof AdminRepositoryError &&
    (error.kind === 'network' || error.kind === 'unknown')
  );
}

/**
 * The same failure, tagged with the spot whose write is unresolved. The kind, message and cause
 * are kept, so the UI words it exactly as before.
 */
function withPendingSpotId(
  error: unknown,
  spotId: string,
): AdminRepositoryError {
  return error instanceof AdminRepositoryError
    ? new AdminRepositoryError(error.kind, error.message, {
        cause: error.cause,
        pendingSpotId: spotId,
      })
    : new AdminRepositoryError('unknown', String(error), {
        cause: error,
        pendingSpotId: spotId,
      });
}

/**
 * Whether an upload failed only because the object exists. That counts as uploaded: the key is
 * the content hash, so the bytes are identical. The Storage API reports it as `statusCode "409"`,
 * with HTTP 400 on older servers and 409 on newer ones.
 */
function isDuplicate(error: StorageFailure): boolean {
  return error.statusCode === '409' || error.status === 409;
}

/**
 * Every admin read and write: the `admin_*` RPCs and the bucket objects behind them, through the
 * signed-in supabase-js client from {@link AdminSession}. A photo is written in two steps with no
 * transaction across Storage and Postgres. Both renditions are uploaded first, then the RPC that
 * references them is called, so a row never points at a missing file. When that RPC is rejected,
 * the objects this call created are deleted, best effort. When its outcome is unknown (no response
 * arrived), the spot is read back first and the objects are deleted only if the write provably did
 * not land. Every failure rejects with an {@link AdminRepositoryError}.
 */
@Injectable({ providedIn: 'root' })
export class AdminRepository {
  private readonly session = inject(AdminSession);

  /** Every city slug, alphabetically. */
  async listCities(): Promise<string[]> {
    const client = await this.client();
    const { data, error, status } = await client
      .from('cities')
      .select('slug')
      .order('slug');
    if (error) {
      throw this.postgrestError(error, status, 'Loading the cities');
    }
    return (data as { slug: string }[]).map((row) => row.slug);
  }

  /** Every spot of a city, or of all cities when `city` is null; deleted spots included. */
  listSpots(city: string | null): Promise<AdminSpot[]> {
    return this.rpc('admin_list_spots', { p_city: city }, 'Loading the spots');
  }

  /** One spot, deleted or not; `invalid` when it does not exist. */
  getSpot(id: string): Promise<AdminSpot> {
    return this.rpc('admin_get_spot', { p_id: id }, 'Loading the spot');
  }

  /**
   * The duplicate check: spots within 25 m of `position`, and spots with the same name (trimmed,
   * case-insensitive) within 100 m.
   */
  nearbySpots(position: LngLat, name: string | null): Promise<NearbySpot[]> {
    return this.rpc(
      'admin_nearby_spots',
      { p_lng: position.lng, p_lat: position.lat, p_name: name },
      'Checking for nearby spots',
    );
  }

  /** Where the picker opens without a GPS guess; null when no live spot exists anywhere. */
  cityCentre(city: string): Promise<LngLat | null> {
    return this.rpc(
      'admin_city_centre',
      { p_city: city },
      'Finding the city centre',
    );
  }

  /** An `admin_settings` value, e.g. the imagery key named by `ImageryConfig.tokenSetting`. */
  imageryToken(setting: string): Promise<string | null> {
    return this.rpc(
      'admin_get_setting',
      { p_key: setting },
      'Loading the imagery key',
    );
  }

  /** Adds a city; `invalid` for a malformed or existing slug. */
  async createCity(slug: string): Promise<void> {
    await this.rpc<null>(
      'admin_create_city',
      { p_slug: slug },
      'Adding the city',
    );
  }

  /**
   * Creates a spot with its photos. The id comes first: `admin_next_spot_id` turns
   * `spotId(name, position)` into the first free `…`, `…-2`, … so the keys already carry the final
   * id. Next, both renditions of every photo are uploaded, and last the row is created through
   * `admin_create_spot`. If that is rejected, the objects this call created are deleted. If its
   * outcome is unknown, the spot is read back through `admin_get_spot`: found with the new keys
   * it is the result; absent, the objects are deleted and the original error is thrown; unreadable,
   * the objects stay and the error carries {@link AdminRepositoryError.pendingSpotId}.
   *
   * @param fields the spot as placed and typed
   * @param photos the processed batch, in display order
   * @param resumeId the `pendingSpotId` of an earlier attempt that ended unresolved. The id is then
   *   reused instead of asked for again, and the spot is read first: if it already landed it is
   *   returned, so a retry cannot create the same spot twice.
   * @returns the created spot
   */
  async createSpotWithPhotos(
    fields: NewSpotFields,
    photos: readonly ProcessedPhoto[],
    resumeId?: string,
  ): Promise<AdminSpot> {
    const id =
      resumeId ??
      (await this.rpc<string>(
        'admin_next_spot_id',
        { p_base: spotId(fields.name, fields.position) },
        'Choosing the spot id',
      ));
    const keyOf = (photo: ProcessedPhoto) =>
      photoKey(fields.city, id, photo.hash8);
    const batch = newPhotos(photos, keyOf, []);
    const keys = batch.map(keyOf);
    if (resumeId !== undefined) {
      let landed: AdminSpot | null;
      try {
        landed = await this.landedSpot(id, keys);
      } catch (error) {
        throw withPendingSpotId(error, id);
      }
      if (landed) {
        return landed;
      }
    }
    const created = await this.uploadPhotos(batch, keys);
    try {
      return await this.rpc<AdminSpot>(
        'admin_create_spot',
        {
          p_spot: {
            id,
            city: fields.city,
            name: fields.name,
            status: fields.status,
            lng: fields.position.lng,
            lat: fields.position.lat,
            notes: blankToNull(fields.notes),
            photos: keys,
          },
        },
        'Saving the spot',
      );
    } catch (error) {
      return this.settleFailedWrite(error, id, keys, created);
    }
  }

  /**
   * Adds photos to an existing spot: uploads both renditions under the spot's city and id, then
   * appends the keys through `admin_add_photos`. If that is rejected, the objects this call
   * created are deleted. If its outcome is unknown, the spot is read back and the objects are
   * deleted only when the keys are not on it.
   *
   * @param spot the spot to attach to; its `city` and `id` name the keys
   * @param photos the processed batch, in display order
   * @returns the updated spot
   */
  async attachPhotos(
    spot: AdminSpot,
    photos: readonly ProcessedPhoto[],
  ): Promise<AdminSpot> {
    const keyOf = (photo: ProcessedPhoto) =>
      photoKey(spot.city, spot.id, photo.hash8);
    const batch = newPhotos(photos, keyOf, spot.photos);
    if (batch.length === 0) {
      return spot; // every photo is already on the spot: nothing to upload or append
    }
    const keys = batch.map(keyOf);
    const created = await this.uploadPhotos(batch, keys);
    try {
      return await this.rpc<AdminSpot>(
        'admin_add_photos',
        { p_spot_id: spot.id, p_keys: keys },
        'Attaching the photos',
      );
    } catch (error) {
      return this.settleFailedWrite(error, spot.id, keys, created);
    }
  }

  /**
   * Deletes a photo permanently. The row goes first (`admin_remove_photo` renumbers the rest),
   * then both objects. If that object delete fails it only warns, because an orphaned
   * content-named object is harmless and the photo is already gone from the map.
   *
   * @param spot the spot the photo belongs to
   * @param key the photo's object key
   * @returns the updated spot
   */
  async removePhoto(spot: AdminSpot, key: string): Promise<AdminSpot> {
    const updated = await this.rpc<AdminSpot>(
      'admin_remove_photo',
      { p_spot_id: spot.id, p_key: key },
      'Removing the photo',
    );
    await this.deleteObjects(
      PHOTO_RENDITIONS.map((size) => objectPath(size, key)),
    );
    return updated;
  }

  /** Changes the given fields only; a position moves the pin (`lng` and `lat` together). */
  updateSpot(id: string, patch: SpotPatch): Promise<AdminSpot> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body['name'] = patch.name;
    if (patch.status !== undefined) body['status'] = patch.status;
    if (patch.notes !== undefined) body['notes'] = blankToNull(patch.notes);
    if (patch.position !== undefined) {
      body['lng'] = patch.position.lng;
      body['lat'] = patch.position.lat;
    }
    return this.rpc(
      'admin_update_spot',
      { p_id: id, p_patch: body },
      'Saving the changes',
    );
  }

  /** Puts a spot's photos in the given order; `keys` must be a permutation of its keys. */
  reorderPhotos(id: string, keys: readonly string[]): Promise<AdminSpot> {
    return this.rpc(
      'admin_reorder_photos',
      { p_spot_id: id, p_keys: [...keys] },
      'Reordering the photos',
    );
  }

  /** Soft-deletes a spot: it leaves the public map and can be restored. */
  deleteSpot(id: string): Promise<AdminSpot> {
    return this.rpc('admin_delete_spot', { p_id: id }, 'Deleting the spot');
  }

  /** Brings a soft-deleted spot back. */
  restoreSpot(id: string): Promise<AdminSpot> {
    return this.rpc('admin_restore_spot', { p_id: id }, 'Restoring the spot');
  }

  /**
   * Decides what a failed spot write leaves behind. A definite rejection (`forbidden`, `conflict`,
   * `invalid`) wrote nothing, so the objects this call created are deleted. When the outcome is
   * unknown the response may simply have been lost after the commit, and deleting then would
   * leave a row pointing at missing files, so the spot is read back instead: with every new key
   * the write landed and the spot is returned; without, it did not, and the objects are deleted.
   * When the read-back cannot tell either, the objects stay (a leftover is harmless) and the error
   * is tagged with the spot id.
   *
   * @param error what the write threw
   * @param spotId the spot the write targeted
   * @param keys the photo keys the write tried to add
   * @param created the Storage paths this call uploaded
   * @returns the spot, when an unknown-outcome write turns out to have landed
   * @throws the original error, tagged with `pendingSpotId` only when the outcome stays unknown
   */
  private async settleFailedWrite(
    error: unknown,
    spotId: string,
    keys: readonly string[],
    created: readonly string[],
  ): Promise<AdminSpot> {
    if (!isUnknownOutcome(error)) {
      await this.deleteObjects(created);
      throw error;
    }
    let landed: AdminSpot | null;
    try {
      landed = await this.landedSpot(spotId, keys);
    } catch {
      throw withPendingSpotId(error, spotId);
    }
    if (landed) {
      return landed;
    }
    await this.deleteObjects(created);
    throw error;
  }

  /**
   * Reads a spot back to see whether a write added the given keys.
   *
   * @param spotId the spot to read
   * @param keys the photo keys the write tried to add
   * @returns the spot when it carries every key; null when it provably does not (no such spot, or
   *   the keys are missing)
   * @throws when the read itself fails for any reason other than "no such spot"
   */
  private async landedSpot(
    spotId: string,
    keys: readonly string[],
  ): Promise<AdminSpot | null> {
    let spot: AdminSpot;
    try {
      spot = await this.getSpot(spotId);
    } catch (error) {
      // `admin_get_spot` raises `invalid` for a spot that does not exist.
      if (error instanceof AdminRepositoryError && error.kind === 'invalid') {
        return null;
      }
      throw error;
    }
    return keys.every((key) => spot.photos.includes(key)) ? spot : null;
  }

  /**
   * Uploads the full and thumbnail rendition of every photo, in order. An object that already
   * exists counts as uploaded but not created. On the first real failure, the objects created so
   * far are deleted and the classified error is thrown.
   *
   * @param photos the processed photos
   * @param keys each photo's object key, index for index
   * @returns the Storage paths this call created
   */
  private async uploadPhotos(
    photos: readonly ProcessedPhoto[],
    keys: readonly string[],
  ): Promise<string[]> {
    const bucket = (await this.client()).storage.from(PHOTO_BUCKET);
    const created: string[] = [];
    for (const [index, photo] of photos.entries()) {
      for (const size of PHOTO_RENDITIONS) {
        const path = objectPath(size, keys[index]);
        const { error } = await bucket.upload(
          path,
          photo[size],
          UPLOAD_OPTIONS,
        );
        if (!error) {
          created.push(path);
        } else if (!isDuplicate(error)) {
          await this.deleteObjects(created);
          throw new AdminRepositoryError(
            storageKind(error),
            `Uploading ${photo.sourceName} failed: ${error.message}`,
            { cause: error },
          );
        }
      }
    }
    return created;
  }

  /**
   * Best-effort delete of bucket objects. A failure is logged with `console.warn` and never
   * thrown, so it cannot mask the error that triggered the cleanup (QC3). A leftover object is
   * content-named and harmless.
   *
   * @param paths Storage paths such as `full/<key>`; nothing happens when empty
   */
  private async deleteObjects(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    try {
      const { error } = await (
        await this.client()
      ).storage
        .from(PHOTO_BUCKET)
        .remove([...paths]);
      if (error) {
        console.warn(
          'Could not delete photo objects; they stay as orphans.',
          paths,
          error,
        );
      }
    } catch (error) {
      console.warn(
        'Could not delete photo objects; they stay as orphans.',
        paths,
        error,
      );
    }
  }

  /** The signed-in client; a failure to load supabase-js surfaces as `network`. */
  private async client(): Promise<SupabaseClient> {
    try {
      return await this.session.client();
    } catch (error) {
      throw new AdminRepositoryError(
        'network',
        'Could not reach the sign-in service. Check the connection and reload the page.',
        { cause: error },
      );
    }
  }

  /** Calls one RPC and returns its data, or throws the classified error. */
  private async rpc<T>(
    fn: string,
    args: Record<string, unknown>,
    action: string,
  ): Promise<T> {
    const client = await this.client();
    const { data, error, status } = await client.rpc(fn, args);
    if (error) {
      throw this.postgrestError(error, status, action);
    }
    return data as T;
  }

  /** Builds the maintainer-facing error for a failed RPC or query. */
  private postgrestError(
    error: PostgrestFailure,
    status: number,
    action: string,
  ): AdminRepositoryError {
    const kind = postgrestKind(error, status);
    return new AdminRepositoryError(
      kind,
      `${action} failed: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}
