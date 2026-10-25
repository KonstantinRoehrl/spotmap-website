import { inject, InjectionToken, Injector } from '@angular/core';

import type { SpotPhotoViewer } from './spot-photo-viewer';

/**
 * Resolves the photo viewer service, importing it, its dialog component and the CDK dialog on
 * first call. Typed by the one method a caller uses, so a spec can resolve a hand-written fake.
 */
export type PhotoViewerLoader = () => Promise<Pick<SpotPhotoViewer, 'open'>>;

/**
 * Keeps the photo viewer out of the map's chunk: a caller holds only this loader, and the viewer
 * arrives in its own lazy chunk when a photo is about to open. Unlike ADMIN_SUPABASE_LOADER it
 * carries its own root factory ({@link createPhotoViewerLoader}), since the viewer is app code
 * that every spec bundle can afford; specs provide a fake loader resolving a fake viewer.
 */
export const PHOTO_VIEWER_LOADER = new InjectionToken<PhotoViewerLoader>(
  'PHOTO_VIEWER_LOADER',
  {
    providedIn: 'root',
    factory: () => createPhotoViewerLoader(inject(Injector)),
  },
);

/**
 * Builds the loader the token provides by default. The first call imports `./spot-photo-viewer`
 * (dynamic `import()`, so the viewer lands in its own lazy chunk) and resolves the root
 * `SpotPhotoViewer` from `injector`; every later call returns that same promise. A failed import
 * is forgotten, so the next call retries instead of replaying the failure.
 *
 * @param injector the root injector, which provides `SpotPhotoViewer`
 */
export function createPhotoViewerLoader(injector: Injector): PhotoViewerLoader {
  let pending: Promise<SpotPhotoViewer> | null = null;
  return () => {
    pending ??= import('./spot-photo-viewer')
      .then(({ SpotPhotoViewer }) => injector.get(SpotPhotoViewer))
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
    return pending;
  };
}
