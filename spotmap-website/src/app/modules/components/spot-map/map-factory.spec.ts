import {
  createMapLibreMap,
  createMapLibrePopup,
  loadElevation,
} from './map-factory';

describe('the maplibre-gl factories', () => {
  it('builds a real maplibre-gl popup with the options it is handed', async () => {
    const options = {
      anchor: 'top',
      closeButton: false,
      closeOnClick: false,
      maxWidth: '320px',
      className: 'spot-popup-frame spot-popup-frame--pending',
    } as const;
    const popup = await createMapLibrePopup(options);
    expect(popup.options).toEqual(jasmine.objectContaining(options));
    expect(popup.isOpen())
      .withContext('built, not yet added to a map')
      .toBe(false);
  });

  it('hands its options to the real maplibre-gl Map constructor', async () => {
    // Headless Chrome hands out no WebGL2 context, so the real constructor rejects with MapLibre's
    // own GPUInitializationError. Reaching that error is the proof the factory got there.
    const container = document.createElement('div');
    container.style.cssText = 'width:100px;height:100px';
    document.body.append(container);
    try {
      await expectAsync(
        createMapLibreMap({
          container,
          style: { version: 8, sources: {}, layers: [] },
        }),
      ).toBeRejectedWithError(/WebGL2 is required/);
    } finally {
      container.remove();
    }
  });

  it('provides the elevation loader as a function', () => {
    expect(loadElevation).toEqual(jasmine.any(Function));
  });
});
