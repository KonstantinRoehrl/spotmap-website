/**
 * Whether the visitor's pointer can hover: a tap on a touch screen must leave no hover behind.
 * Queried on each call, so a hybrid device's answer follows its current pointer. Guards
 * `window`/`matchMedia` so it is safe under SSR or headless envs.
 */
export function canHover(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover)').matches
  );
}
