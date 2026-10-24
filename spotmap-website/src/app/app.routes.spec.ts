import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Route } from '@angular/router';

import { routes } from './app.routes';
import { AboutComponent } from './modules/pages/about/about.component';
import { ADMIN_ROUTES } from './modules/pages/admin/admin.routes';
import { HomeComponent } from './modules/pages/home/home.component';
import { MapComponent } from './modules/pages/map/map.component';

/** The route registered for `path`; every spec below expects it to exist. */
function routeFor(path: string): Route {
  const route = routes.find((candidate) => candidate.path === path);
  expect(route).withContext(`a route for "${path}"`).toBeDefined();
  return route!;
}

describe('routes', () => {
  for (const [path, component] of [
    ['home', HomeComponent],
    ['map', MapComponent],
    ['about', AboutComponent],
  ] as const) {
    it(`loads the ${path} page lazily`, async () => {
      expect(await routeFor(path).loadComponent?.()).toBe(component);
    });
  }

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

    it('sends an unknown path home', async () => {
      await router.navigateByUrl('/no-such-page');
      expect(router.url).toBe('/home');
    });
  });
});
