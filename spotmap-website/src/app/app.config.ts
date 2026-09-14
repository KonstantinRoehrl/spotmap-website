import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { createMapLibreMap } from './modules/components/spot-map/map-factory';
import {
  MAP_FACTORY,
  POPUP_FACTORY,
  PopupFactory,
} from './modules/components/spot-map/map-factory.token';

/** Loads maplibre-gl on first use, keeping it out of the initial route chunk. */
const createMapLibrePopup: PopupFactory = async (options) => {
  const { Popup } = await import('maplibre-gl');
  return new Popup(options);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
    { provide: MAP_FACTORY, useValue: createMapLibreMap },
    { provide: POPUP_FACTORY, useValue: createMapLibrePopup },
  ],
};
