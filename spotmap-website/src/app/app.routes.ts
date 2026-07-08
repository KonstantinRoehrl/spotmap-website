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
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' },
];
