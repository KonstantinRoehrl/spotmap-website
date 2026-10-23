import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () =>
      import('./modules/pages/home/home.component').then(
        (m) => m.HomeComponent,
      ),
  },
  {
    path: 'map',
    loadComponent: () =>
      import('./modules/pages/map/map.component').then((m) => m.MapComponent),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./modules/pages/about/about.component').then(
        (m) => m.AboutComponent,
      ),
  },
  // The maintainer tool: no link from the public UI; lazy, so the public bundle carries none of it.
  {
    path: 'admin',
    loadChildren: () =>
      import('./modules/pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  // Root has no requested page → land on the map (the intro's default
  // destination). Explicit /home, /map, /about, /admin are matched above and preserved.
  { path: '', redirectTo: 'map', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' },
];
