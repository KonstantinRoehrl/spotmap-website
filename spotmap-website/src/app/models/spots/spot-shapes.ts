import {
  SpotCollection,
  SpotDetail,
  SpotFeature,
  SpotListCollection,
  SpotListFeature,
} from './spot';

/*
 * The snapshot's full shape cut down to the two shapes the map page reads. The live database
 * serves both directly (`city_spot_list()`, `spot_detail()`); these derive them from the bundled
 * snapshot when it stands in, so both paths hand the page the same thing.
 */

/**
 * One spot in the list shape: its id, name and status, its first photo as the cover (null without
 * photos) and its photo count — the notes and the photo list are left behind.
 */
export function toListFeature(feature: SpotFeature): SpotListFeature {
  const { id, name, status, photos } = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id,
      name,
      status,
      cover: photos[0] ?? null,
      photoCount: photos.length,
    },
  };
}

/** A city's whole collection in the list shape, in the same order. */
export function toListCollection(
  collection: SpotCollection,
): SpotListCollection {
  return {
    type: 'FeatureCollection',
    features: collection.features.map(toListFeature),
  };
}

/**
 * One spot's full record, with the city whose snapshot it was found in.
 *
 * @param city the city slug of the snapshot holding `feature`
 */
export function toSpotDetail(feature: SpotFeature, city: string): SpotDetail {
  const { id, name, status, notes, photos } = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;
  return {
    id,
    city,
    name,
    status,
    notes,
    photos: [...photos],
    coordinates: [lng, lat],
  };
}
