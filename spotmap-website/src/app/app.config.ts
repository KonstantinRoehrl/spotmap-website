import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  createMapLibreMap,
  loadElevation,
} from './modules/components/spot-map/map-factory';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
  POPUP_FACTORY,
  PopupFactory,
} from './modules/components/spot-map/map-factory.token';
import { IMAGERY_CONFIG } from './services/admin/imagery';
import { SPOTMAP_BACKEND } from './services/spotmap-backend';

/** Loads maplibre-gl on first use, keeping it out of the initial route chunk. */
const createMapLibrePopup: PopupFactory = async (options) => {
  const { Popup } = await import('maplibre-gl');
  return new Popup(options);
};

/**
 * The app's root providers: the real maplibre factories, the elevation loader, and the build
 * environment's Supabase backend and satellite imagery.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
    { provide: MAP_FACTORY, useValue: createMapLibreMap },
    { provide: POPUP_FACTORY, useValue: createMapLibrePopup },
    { provide: ELEVATION_LOADER, useValue: loadElevation },
    { provide: SPOTMAP_BACKEND, useValue: environment.backend },
    { provide: IMAGERY_CONFIG, useValue: environment.imagery },
  ],
};
