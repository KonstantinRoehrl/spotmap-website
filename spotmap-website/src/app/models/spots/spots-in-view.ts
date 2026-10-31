import { Observable, of } from 'rxjs';
import type { ViewBounds } from '../map/map-camera';
import { SpotListCollection, SpotListFeature } from './spot';

/**
 * The one question the list, its count and the sheet ask: which spots lie inside these bounds,
 * A–Z by name, in the list shape. Phase 12 answers it in the app from the loaded city
 * ({@link LoadedSpotsInView}); Phase 11's continuous map swaps in a bounding-box query on the
 * PostGIS GiST index of `spots.location`, which is why the answer is an `Observable`, without the
 * list, the count or the sheet changing.
 */
export interface SpotsInView {
  /** The spots inside `bounds` (edges included), A–Z by {@link compareSpotNames}. */
  spotsIn(bounds: ViewBounds): Observable<readonly SpotListFeature[]>;
}

/** Locale-aware, case- and accent-insensitive: `Äpfel`, `apfel` and `Apfel` compare equal. */
const SPOT_NAME_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: 'base',
});

/**
 * The list's A–Z order: by name through {@link SPOT_NAME_COLLATOR}, then by id, so spots whose
 * names compare equal keep one fixed order and rows never swap places while the map moves.
 */
export function compareSpotNames(
  a: SpotListFeature,
  b: SpotListFeature,
): number {
  const byName = SPOT_NAME_COLLATOR.compare(
    a.properties.name,
    b.properties.name,
  );
  if (byName !== 0) {
    return byName;
  }
  const [idA, idB] = [a.properties.id, b.properties.id];
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

/**
 * Phase 12's {@link SpotsInView}: filters the loaded city's list in the app. The collection is
 * sorted once here, so each answer — asked for at most once per animation frame while the map
 * moves — is a single pass that keeps that order. It answers synchronously.
 */
export class LoadedSpotsInView implements SpotsInView {
  /** The collection's spots, A–Z; the collection itself is left in its dataset order. */
  private readonly byName: readonly SpotListFeature[];

  /** @param collection the loaded city's spots in the list shape */
  constructor(collection: SpotListCollection) {
    this.byName = [...collection.features].sort(compareSpotNames);
  }

  /** The loaded spots inside `bounds`, edges included, A–Z. */
  spotsIn(bounds: ViewBounds): Observable<readonly SpotListFeature[]> {
    return of(
      this.byName.filter(({ geometry }) => {
        const [lng, lat] = geometry.coordinates;
        return (
          lng >= bounds.west &&
          lng <= bounds.east &&
          lat >= bounds.south &&
          lat <= bounds.north
        );
      }),
    );
  }
}
