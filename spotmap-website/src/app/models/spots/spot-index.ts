import type { SpotListCollection, SpotListFeature } from './spot';

/** A loaded list's spots by id. */
export type SpotIndex = ReadonlyMap<string, SpotListFeature>;

const indexes = new WeakMap<SpotListCollection, SpotIndex>();

/**
 * The index of `collection`, built once per collection object: the map and the store receive the
 * same object for one load, so they share one build.
 */
export function spotIndexOf(collection: SpotListCollection): SpotIndex {
  let index = indexes.get(collection);
  if (!index) {
    index = new Map(
      collection.features.map((feature) => [feature.properties.id, feature]),
    );
    indexes.set(collection, index);
  }
  return index;
}
