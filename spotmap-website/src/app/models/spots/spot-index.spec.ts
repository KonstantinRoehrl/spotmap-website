import type { SpotListCollection, SpotListFeature } from './spot';
import { spotIndexOf } from './spot-index';

function collectionOf(...ids: string[]): SpotListCollection {
  return {
    type: 'FeatureCollection',
    features: ids.map((id) => ({ properties: { id } }) as SpotListFeature),
  } as SpotListCollection;
}

describe('spotIndexOf', () => {
  it('finds each spot by id, as the same feature object', () => {
    const collection = collectionOf('a', 'b');
    const index = spotIndexOf(collection);
    expect(index.get('a')).toBe(collection.features[0]);
    expect(index.get('b')).toBe(collection.features[1]);
  });

  it('answers undefined for an id the list does not hold', () => {
    expect(spotIndexOf(collectionOf('a')).get('z')).toBeUndefined();
  });

  it('builds once per collection object', () => {
    const collection = collectionOf('a');
    expect(spotIndexOf(collection)).toBe(spotIndexOf(collection));
  });

  it('builds another index for another collection object', () => {
    expect(spotIndexOf(collectionOf('a'))).not.toBe(
      spotIndexOf(collectionOf('a')),
    );
  });
});
