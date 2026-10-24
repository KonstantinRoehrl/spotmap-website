/*
 * The loading events of one map build. SpotMapComponent reports every kind but `pins-drawn`,
 * which MapContainerComponent puts together from the map's `ready`; MapLoadProgress folds them
 * into the loader's progress. Neither component's folder owns the union, so it lives here.
 */

/** One real loading event, in the order a build normally reports them. */
export type MapLoadEvent =
  | { readonly kind: 'spots-sent' }
  | { readonly kind: 'spots-headers' }
  | { readonly kind: 'spots-fallback' }
  | { readonly kind: 'spots-done' }
  | { readonly kind: 'renderer-ready' }
  | { readonly kind: 'style-loaded' }
  | {
      readonly kind: 'tiles';
      readonly loaded: number;
      readonly requested: number;
    }
  | { readonly kind: 'painted' }
  | { readonly kind: 'pins-drawn' };
