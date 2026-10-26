import { createMapLibreMap, loadElevation } from './map-factory';

describe('the maplibre-gl factories', () => {
  it('hands its options to the real maplibre-gl Map constructor', async () => {
    // Whether the real constructor gets a WebGL2 context depends on the machine running the spec:
    // without one it rejects with MapLibre's own GPUInitializationError, with one it builds a map.
    // Either outcome proves the factory got there, so the spec accepts both.
    const container = document.createElement('div');
    container.style.cssText = 'width:100px;height:100px';
    document.body.append(container);
    try {
      const outcome = await createMapLibreMap({
        container,
        style: { version: 8, sources: {}, layers: [] },
      }).then(
        (map) => ({ map }),
        (error: unknown) => ({ error }),
      );
      if ('map' in outcome) {
        expect(outcome.map.getContainer()).toBe(container);
        outcome.map.remove();
      } else {
        expect(outcome.error).toEqual(
          jasmine.objectContaining({
            message: jasmine.stringMatching(/WebGL2 is required/),
          }),
        );
      }
    } finally {
      container.remove();
    }
  });

  it('provides the elevation loader as a function', () => {
    expect(loadElevation).toEqual(jasmine.any(Function));
  });
});
