import { TestBed } from '@angular/core/testing';

import { environment } from '../environments/environment';
import { appConfig } from './app.config';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
} from './modules/components/spot-map/map-factory.token';
import { ADMIN_SUPABASE_LOADER } from './services/admin/admin-supabase';
import { IMAGERY_CONFIG } from './services/admin/imagery';
import { SPOTMAP_BACKEND } from './services/spotmap-backend';

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

  it('provides the build environment’s backend so SpotsService and the popup can reach it', () => {
    const provider = appConfig.providers.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        p.provide === SPOTMAP_BACKEND,
    ) as { useValue?: unknown } | undefined;
    expect(provider?.useValue).toBe(environment.backend);
  });

  it('provides the build environment’s imagery so the satellite picker can draw it', () => {
    const provider = appConfig.providers.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        p.provide === IMAGERY_CONFIG,
    ) as { useValue?: unknown } | undefined;
    expect(provider?.useValue).toBe(environment.imagery);
  });

  it('registers the admin supabase-js loader, which downloads nothing until it is called', () => {
    const provider = appConfig.providers.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        p.provide === ADMIN_SUPABASE_LOADER,
    ) as { useFactory?: () => unknown } | undefined;
    expect(provider?.useFactory).toEqual(jasmine.any(Function));
    const loader = TestBed.runInInjectionContext(() => provider!.useFactory!());
    expect(loader).toEqual(jasmine.any(Function));
  });
});
