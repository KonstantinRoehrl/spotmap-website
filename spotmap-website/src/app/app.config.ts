import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import {
  createMapLibreMap,
  loadElevation,
} from './modules/components/spot-map/map-factory';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
} from './modules/components/spot-map/map-factory.token';
import { provideAdminAuthCallback } from './services/admin/admin-auth-callback';
import {
  ADMIN_SUPABASE_LOADER,
  createAdminSupabaseLoader,
} from './services/admin/admin-supabase';
import { IMAGERY_CONFIG } from './services/admin/imagery';
import { SPOTMAP_BACKEND } from './services/spotmap-backend';

/**
 * The app's root providers: the real maplibre map factory, the elevation loader, the build
 * environment's Supabase backend and imagery config, the lazy supabase-js loader the admin pages
 * use, and the initializer that lets a sign-in link's session land before the first navigation.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    { provide: MAP_FACTORY, useValue: createMapLibreMap },
    { provide: ELEVATION_LOADER, useValue: loadElevation },
    { provide: SPOTMAP_BACKEND, useValue: environment.backend },
    { provide: IMAGERY_CONFIG, useValue: environment.imagery },
    {
      provide: ADMIN_SUPABASE_LOADER,
      useFactory: () => createAdminSupabaseLoader(inject(SPOTMAP_BACKEND)),
    },
    provideAdminAuthCallback(),
  ],
};
