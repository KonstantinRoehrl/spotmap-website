import { Routes } from '@angular/router';

import { AdminShellComponent } from './admin-shell/admin-shell.component';
import { adminGuard } from './admin.guard';

/**
 * The hidden admin route tree, lazy-loaded under `/admin` by app.routes.ts so none of it — nor
 * supabase-js, which only it reaches — enters the initial bundle. `sign-in` is open; everything
 * else sits in the guarded shell. A later admin page (Phases 10, 13, 14) is one more child here
 * and needs no auth code of its own.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: 'sign-in',
    loadComponent: () =>
      import('./admin-sign-in/admin-sign-in.component').then(
        (m) => m.AdminSignInComponent,
      ),
  },
  {
    path: '',
    component: AdminShellComponent,
    canActivate: [adminGuard],
    // Task 14 adds the '' → 'add' redirect and 'add'; Task 15 adds 'spots' and 'spots/:id'.
    children: [],
  },
];
