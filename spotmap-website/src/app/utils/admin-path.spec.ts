import { isAdminPath } from './admin-path';

describe('isAdminPath', () => {
  it('matches the admin route, its children, and either with a query or a fragment', () => {
    for (const path of [
      '/admin',
      '/admin/',
      '/admin/sign-in',
      '/admin/spots/hbf-curb-99f6e5',
      '/admin?denied=1',
      '/admin#access_token=x',
      '/admin/sign-in?denied=1',
    ]) {
      expect(isAdminPath(path)).withContext(path).toBeTrue();
    }
  });

  it('leaves every public path alone', () => {
    for (const path of [
      '',
      '/',
      '/map',
      '/home',
      '/about',
      '/administrator',
      '/admins',
      '/map/admin',
      '/context.html',
    ]) {
      expect(isAdminPath(path)).withContext(path).toBeFalse();
    }
  });
});
