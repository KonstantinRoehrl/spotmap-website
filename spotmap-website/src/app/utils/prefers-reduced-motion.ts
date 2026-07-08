/**
 * SSR- / no-DOM-safe check for the user's reduced-motion preference.
 *
 * Returns true when the OS/browser requests reduced motion, letting the heavy
 * CRT animations fall back to a static end-state (DESIGN.md / design.json
 * motion rule: every heavy animation needs a prefers-reduced-motion fallback).
 * Guards `window`/`matchMedia` so it is safe under SSR or headless envs.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
