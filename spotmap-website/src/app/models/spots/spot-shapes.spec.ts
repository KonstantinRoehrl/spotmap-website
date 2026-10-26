import { SpotCollection, SpotFeature } from './spot';
import { toListCollection, toListFeature, toSpotDetail } from './spot-shapes';

/** A full-shape spot with two photos and notes. */
const WITH_PHOTOS: SpotFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [16.37, 48.2] },
  properties: {
    id: 'a-1',
    name: 'Alpha Bank',
    status: 'active',
    notes: 'wax\nthe ledge',
    photos: ['vienna/a-1-1.webp', 'vienna/a-1-2.webp'],
  },
};

/** A full-shape spot with neither photos nor notes. */
const WITHOUT_PHOTOS: SpotFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [16.4, 48.22] },
  properties: {
    id: 'b-2',
    name: 'Beta Ledge',
    status: 'demolished',
    notes: null,
    photos: [],
  },
};

describe('spot shapes', () => {
  it('derives the list shape: the first photo as cover and the photo count, nothing else', () => {
    const feature = toListFeature(WITH_PHOTOS);
    expect(feature).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [16.37, 48.2] },
      properties: {
        id: 'a-1',
        name: 'Alpha Bank',
        status: 'active',
        cover: 'vienna/a-1-1.webp',
        photoCount: 2,
      },
    });
    expect(Object.keys(feature.properties)).toEqual([
      'id',
      'name',
      'status',
      'cover',
      'photoCount',
    ]);
  });

  it('gives a spot without photos a null cover and a count of 0', () => {
    expect(toListFeature(WITHOUT_PHOTOS).properties).toEqual({
      id: 'b-2',
      name: 'Beta Ledge',
      status: 'demolished',
      cover: null,
      photoCount: 0,
    });
  });

  it('never shares the full feature’s coordinate array', () => {
    const feature = toListFeature(WITH_PHOTOS);
    feature.geometry.coordinates[0] = 0;
    expect(WITH_PHOTOS.geometry.coordinates[0]).toBe(16.37);
  });

  it('maps a whole collection, keeping the dataset order', () => {
    const collection: SpotCollection = {
      type: 'FeatureCollection',
      features: [WITHOUT_PHOTOS, WITH_PHOTOS],
    };
    expect(
      toListCollection(collection).features.map((f) => f.properties.id),
    ).toEqual(['b-2', 'a-1']);
    expect(toListCollection(collection).type).toBe('FeatureCollection');
  });

  it('derives the detail with its city, every photo in order and the coordinates', () => {
    expect(toSpotDetail(WITH_PHOTOS, 'vienna')).toEqual({
      id: 'a-1',
      city: 'vienna',
      name: 'Alpha Bank',
      status: 'active',
      notes: 'wax\nthe ledge',
      photos: ['vienna/a-1-1.webp', 'vienna/a-1-2.webp'],
      coordinates: [16.37, 48.2],
    });
  });
});
