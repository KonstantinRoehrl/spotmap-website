import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Route } from '@angular/router';

import { routes } from './app.routes';
import { AboutComponent } from './modules/pages/about/about.component';
import { ADMIN_ROUTES } from './modules/pages/admin/admin.routes';
import { HomeComponent } from './modules/pages/home/home.component';
import { MapComponent } from './modules/pages/map/map.component';
import { matchMapPage } from './utils/map-page-path';

/** The route registered for `path`; every spec below expects it to exist. */
function routeFor(path: string): Route {
  const route = routes.find((candidate) => candidate.path === path);
  expect(route).withContext(`a route for "${path}"`).toBeDefined();
  return route!;
}

describe('routes', () => {
  for (const [path, component] of [
    ['home', HomeComponent],
    ['about', AboutComponent],
  ] as const) {
    it(`loads the ${path} page lazily`, async () => {
      expect(await routeFor(path).loadComponent?.()).toBe(component);
    });
  }

  it('serves /map and /spot/<id> from one lazily loaded map-page route', async () => {
    const mapRoutes = routes.filter((route) => route.matcher === matchMapPage);
    expect(mapRoutes.length).toBe(1);
    expect(await mapRoutes[0].loadComponent?.()).toBe(MapComponent);
  });

  it('declares the map-page route before the catch-all', () => {
    const mapPage = routes.findIndex((route) => route.matcher === matchMapPage);
    const catchAll = routes.findIndex((route) => route.path === '**');
    expect(mapPage).toBeGreaterThanOrEqual(0);
    expect(mapPage).toBeLessThan(catchAll);
  });

  it('loads the maintainer tool’s routes lazily', async () => {
    expect(await routeFor('admin').loadChildren?.()).toBe(ADMIN_ROUTES);
  });

  describe('redirects', () => {
    let router: Router;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideRouter(routes), provideLocationMocks()],
      });
      router = TestBed.inject(Router);
    });

    it('lands the bare root on the map', async () => {
      await router.navigateByUrl('/');
      expect(router.url).toBe('/map');
    });

    it('keeps a spot link on its own URL', async () => {
      await router.navigateByUrl('/spot/hbf-curb-99f6e5');
      expect(router.url).toBe('/spot/hbf-curb-99f6e5');
    });

    it('sends a spot path without an id home', async () => {
      await router.navigateByUrl('/spot');
      expect(router.url).toBe('/home');
    });

    it('sends a spot path with an extra segment home', async () => {
      await router.navigateByUrl('/spot/a/b');
      expect(router.url).toBe('/home');
    });

    it('sends an unknown path home', async () => {
      await router.navigateByUrl('/no-such-page');
      expect(router.url).toBe('/home');
    });
  });
});
