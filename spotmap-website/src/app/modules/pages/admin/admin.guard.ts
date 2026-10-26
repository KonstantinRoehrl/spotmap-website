import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AdminSession } from '../../../services/admin/admin-session';

/**
 * Lets only a signed-in admin into the admin shell; everyone else lands on `/admin/sign-in`, a
 * signed-in non-admin with `?denied=1`. Convenience only: the database enforces `is_admin()` on
 * every write. When the session cannot load the guard redirects without the error — the sign-in
 * page calls `ready()` again (a failed run is not memoised) and shows it there.
 */
export const adminGuard: CanActivateFn = async () => {
  const session = inject(AdminSession);
  const router = inject(Router);
  const signIn = router.createUrlTree(['/admin/sign-in']);
  try {
    await session.ready();
  } catch {
    return signIn;
  }
  const state = session.state();
  if (state.status !== 'signed-in') return signIn;
  if (state.isAdmin) return true;
  return router.createUrlTree(['/admin/sign-in'], {
    queryParams: { denied: '1' },
  });
};
