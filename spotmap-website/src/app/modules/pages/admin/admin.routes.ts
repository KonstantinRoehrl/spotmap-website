import { Routes } from '@angular/router';

import { AdminShellComponent } from './admin-shell/admin-shell.component';
import { adminGuard } from './admin.guard';

/**
 * The hidden admin route tree, lazy-loaded under `/admin` by app.routes.ts so none of it — nor
 * supabase-js, which only it reaches — enters the initial bundle. `sign-in` is open; everything
 * else sits in the guarded shell, whose default child is `add` (create-or-attach); its other children
 * are `spots` (the spot list) and `spots/:id` (the spot edit page). A later admin page (Phases 10, 13, 14) is one more child here
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
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'add' },
      {
        path: 'add',
        loadComponent: () =>
          import('./create-or-attach/create-or-attach.component').then(
            (m) => m.CreateOrAttachComponent,
          ),
      },
      {
        path: 'spots',
        loadComponent: () =>
          import('./spot-list/spot-list.component').then(
            (m) => m.SpotListComponent,
          ),
      },
      {
        path: 'spots/:id',
        loadComponent: () =>
          import('./spot-edit/spot-edit.component').then(
            (m) => m.SpotEditComponent,
          ),
      },
    ],
  },
];
