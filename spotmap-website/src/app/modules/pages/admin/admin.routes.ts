import { Routes } from '@angular/router';

import { AdminShellComponent } from './admin-shell/admin-shell.component';
import { adminGuard } from './admin.guard';

/**
 * The hidden admin route tree, lazy-loaded under `/admin` by app.routes.ts so none of it — nor
 * supabase-js, which only it reaches — enters the initial bundle. `sign-in` is open; everything
 * else sits in the guarded shell, whose default child is `add` (create-or-attach); its other children
 * are `spots` (the spot list) and `spots/:id` (the spot edit page). A later admin page (Phases 10, 13, 14) is one more child here
 * and needs no auth code of its own. Every page route carries a `title`, which the router writes
 * to the document title on each navigation.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: 'sign-in',
    title: 'Sign in · Spotmap admin',
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
        title: 'Add a spot · Spotmap admin',
        loadComponent: () =>
          import('./create-or-attach/create-or-attach.component').then(
            (m) => m.CreateOrAttachComponent,
          ),
      },
      {
        path: 'spots',
        title: 'Spots · Spotmap admin',
        loadComponent: () =>
          import('./spot-list/spot-list.component').then(
            (m) => m.SpotListComponent,
          ),
      },
      {
        path: 'spots/:id',
        title: 'Edit spot · Spotmap admin',
        loadComponent: () =>
          import('./spot-edit/spot-edit.component').then(
            (m) => m.SpotEditComponent,
          ),
      },
    ],
  },
];
