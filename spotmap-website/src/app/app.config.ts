import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

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

/** Loads maplibre-gl on first use, keeping it out of the initial route chunk. */
const createMapLibrePopup: PopupFactory = async (options) => {
  const { Popup } = await import('maplibre-gl');
  return new Popup(options);
};

/** The app's root providers, including the real maplibre factories and the elevation loader. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
    { provide: MAP_FACTORY, useValue: createMapLibreMap },
    { provide: POPUP_FACTORY, useValue: createMapLibrePopup },
    { provide: ELEVATION_LOADER, useValue: loadElevation },
  ],
};
