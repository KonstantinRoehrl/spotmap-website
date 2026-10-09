import { appConfig } from './app.config';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
} from './modules/components/spot-map/map-factory.token';

describe('appConfig', () => {
  it('registers a map factory so SpotMapComponent has one outside tests', () => {
    const provided = appConfig.providers.some(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        p.provide === MAP_FACTORY,
    );
    expect(provided).toBe(true);
  });

  it('registers an elevation loader so SpotMapComponent has one outside tests', () => {
    const provided = appConfig.providers.some(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        p.provide === ELEVATION_LOADER,
    );
    expect(provided).toBe(true);
  });
});
