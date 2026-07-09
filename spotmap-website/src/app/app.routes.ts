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
  // Root has no requested page → land on the map (the intro's default
  // destination). Explicit /home, /map, /about are matched above and preserved.
  { path: '', redirectTo: 'map', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' },
];
