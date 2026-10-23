/**
 * The insert-only sync's plan: which extracted spots the database has never seen. Once a spot is
 * in the database the maintainer tool owns it — it may have been moved, renamed or deleted there —
 * so an extracted spot is never compared field by field, only inserted when it is new. One that
 * sits on, or shares its exact name with, a spot the database holds under another id is held back
 * as a possible duplicate for the maintainer to resolve. Pure: no I/O.
 */
import {
  NAME_MATCH_MAX_M,
  POSITION_MATCH_MAX_M,
  distanceMeters,
} from '../extract-spots/match.mjs';

/**
 * One row of `sync_existing_spots()`: a spot the database holds, deleted ones included.
 *
 * @typedef {object} ExistingSpot
 * @property {string} id
 * @property {string} city
 * @property {string} name
 * @property {number} lng
 * @property {number} lat
 * @property {boolean} deleted
 */

/**
 * An extracted spot held back because the database already holds a spot like it.
 *
 * @typedef {object} PossibleDuplicate
 * @property {string} id the extracted spot's id
 * @property {string} duplicateOf the id of the nearest existing spot that matched
 * @property {number} distanceM metres between the two
 * @property {'position' | 'name'} reason `position`: within {@link POSITION_MATCH_MAX_M};
 *   `name`: the identical name within {@link NAME_MATCH_MAX_M}
 */

/**
 * The nearest existing spot within `maxM` of `spot` that `qualifies`, or null when none is.
 *
 * @param {{ lng: number, lat: number }} spot
 * @param {ExistingSpot[]} existing
 * @param {number} maxM inclusive, like PostGIS `st_dwithin`
 * @param {(other: ExistingSpot) => boolean} qualifies
 * @returns {{ duplicateOf: string, distanceM: number } | null}
 */
function nearestWithin(spot, existing, maxM, qualifies) {
  let nearest = null;
  for (const other of existing) {
    if (!qualifies(other)) {
      continue;
    }
    const distanceM = distanceMeters(
      [spot.lng, spot.lat],
      [other.lng, other.lat],
    );
    if (
      distanceM <= maxM &&
      (nearest === null || distanceM < nearest.distanceM)
    ) {
      nearest = { duplicateOf: other.id, distanceM };
    }
  }
  return nearest;
}

/**
 * Plans the insert. Each extracted spot is compared only with `existing`, the database at the
 * start of the run — never with another extracted spot — by these rules, in order:
 *
 * 1. its id is present (deleted or not) → `alreadyPresent`;
 * 2. an existing spot within {@link POSITION_MATCH_MAX_M} → a `position` duplicate;
 * 3. an existing spot with the identical name (`===`) within {@link NAME_MATCH_MAX_M} → a `name`
 *    duplicate;
 * 4. otherwise → `inserts`.
 *
 * A duplicate reports the nearest existing spot its rule matched.
 *
 * @param {import('./payload.mjs').SyncSpot[]} spots the payload's rows, in payload order
 * @param {ExistingSpot[]} existing every spot the database holds
 * @returns {{ inserts: import('./payload.mjs').SyncSpot[], alreadyPresent: string[],
 *   possibleDuplicates: PossibleDuplicate[] }} each in payload order; `inserts` holds the payload
 *   rows themselves
 */
export function planInserts(spots, existing) {
  const presentIds = new Set(existing.map(({ id }) => id));
  const inserts = [];
  const alreadyPresent = [];
  const possibleDuplicates = [];
  for (const spot of spots) {
    if (presentIds.has(spot.id)) {
      alreadyPresent.push(spot.id);
      continue;
    }
    const byPosition = nearestWithin(
      spot,
      existing,
      POSITION_MATCH_MAX_M,
      () => true,
    );
    const byName =
      byPosition === null
        ? nearestWithin(
            spot,
            existing,
            NAME_MATCH_MAX_M,
            (other) => other.name === spot.name,
          )
        : null;
    if (byPosition !== null) {
      possibleDuplicates.push({
        id: spot.id,
        ...byPosition,
        reason: 'position',
      });
    } else if (byName !== null) {
      possibleDuplicates.push({ id: spot.id, ...byName, reason: 'name' });
    } else {
      inserts.push(spot);
    }
  }
  return { inserts, alreadyPresent, possibleDuplicates };
}
