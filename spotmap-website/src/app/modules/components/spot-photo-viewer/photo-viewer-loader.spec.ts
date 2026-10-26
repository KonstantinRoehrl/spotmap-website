import { TestBed } from '@angular/core/testing';

import { PHOTO_VIEWER_LOADER } from './photo-viewer-loader';
import { SpotPhotoViewer } from './spot-photo-viewer';

describe('PHOTO_VIEWER_LOADER', () => {
  it('resolves the root SpotPhotoViewer by default, without registration', async () => {
    const viewer = await TestBed.inject(PHOTO_VIEWER_LOADER)();
    expect(viewer).toBeInstanceOf(SpotPhotoViewer);
    expect(viewer).toBe(TestBed.inject(SpotPhotoViewer));
  });

  it('loads the viewer once, however often it is asked', async () => {
    const load = TestBed.inject(PHOTO_VIEWER_LOADER);
    const first = load();
    expect(load()).toBe(first);
    // Let the load finish while the test's injector is still alive.
    await first;
  });
});
