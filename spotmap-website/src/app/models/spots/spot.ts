/** Pin taxonomy. `unclassified` is the KML's green group, whose meaning is Decision 1's call. */
export type SpotStatus = 'active' | 'demolished' | 'unclassified';

export interface SpotProperties {
  id: string;
  name: string;
  status: SpotStatus;
  /** Base-relative asset paths, never a leading slash — production runs under /spotmap-website/. */
  photos: string[];
}

export interface SpotFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SpotProperties;
}

export interface SpotCollection {
  type: 'FeatureCollection';
  features: SpotFeature[];
}
