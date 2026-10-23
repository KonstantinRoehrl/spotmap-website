import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';

import {
  AdminAuthError,
  AdminSession,
  AdminSessionState,
} from '../../../services/admin/admin-session';
import { adminGuard } from './admin.guard';

/** Runs the guard against a fake session that settles on `state` (or rejects with `failure`). */
async function guardWith(
  state: AdminSessionState,
  failure?: AdminAuthError,
): Promise<string | boolean> {
  const current = signal(state);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AdminSession,
        useValue: {
          state: current.asReadonly(),
          ready: () =>
            failure ? Promise.reject(failure) : Promise.resolve(current()),
        },
      },
    ],
  });
  const result = await TestBed.runInInjectionContext(() =>
    adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return result instanceof UrlTree
    ? TestBed.inject(Router).serializeUrl(result)
    : (result as boolean);
}

describe('adminGuard', () => {
  it('lets a signed-in admin in', async () => {
    expect(
      await guardWith({
        status: 'signed-in',
        email: 'maintainer@example.org',
        isAdmin: true,
      }),
    ).toBeTrue();
  });

  it('sends a signed-in non-admin to sign-in, marked as denied', async () => {
    expect(
      await guardWith({
        status: 'signed-in',
        email: 'visitor@example.org',
        isAdmin: false,
      }),
    ).toBe('/admin/sign-in?denied=1');
  });

  it('sends a signed-out visitor to sign-in', async () => {
    expect(await guardWith({ status: 'signed-out', linkError: null })).toBe(
      '/admin/sign-in',
    );
  });

  it('sends the visitor to sign-in, where the error is shown, when the session cannot load', async () => {
    expect(
      await guardWith({ status: 'loading' }, new AdminAuthError('network')),
    ).toBe('/admin/sign-in');
  });
});
