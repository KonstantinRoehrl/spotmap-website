/** `/admin` itself, or followed by a child path, a query string or a fragment. */
const ADMIN_PATH = /^\/admin(?:[/?#]|$)/;

/**
 * Whether an app path is inside the hidden admin route tree, where AppComponent skips the intro
 * and hides the public nav bar.
 *
 * @param path a path as `Location.path()` or a router URL reports it — relative to the base
 *   href, starting with `/`, e.g. `/admin/sign-in?denied=1`
 */
export function isAdminPath(path: string): boolean {
  return ADMIN_PATH.test(path);
}
