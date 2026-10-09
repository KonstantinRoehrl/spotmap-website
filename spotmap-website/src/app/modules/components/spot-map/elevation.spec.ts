import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import type mlcontour from 'maplibre-contour';
import {
  CONTOUR_THRESHOLDS,
  createElevationLoader,
  type ElevationImporters,
  type ElevationTiles,
  MAPTERHORN_DEM,
} from './elevation';

/** Records what the loader asks of maplibre-contour's `DemSource`, without generating anything. */
class FakeDemSource {
  static readonly created: FakeDemSource[] = [];
  readonly sharedDemProtocolUrl = 'dem-shared://{z}/{x}/{y}';
  readonly setupMaplibre = jasmine.createSpy('setupMaplibre');
  contourOptions?: unknown;

  constructor(readonly options: unknown) {
    FakeDemSource.created.push(this);
  }

  contourProtocolUrl(options: unknown): string {
    this.contourOptions = options;
    return 'dem-contour://{z}/{x}/{y}?thresholds=11*50*100';
  }
}

/** A `DemSource` whose construction fails, the way a blocked worker would. */
class BrokenDemSource {
  constructor() {
    throw new Error('worker blocked');
  }
}

/** The maplibre-gl module as the loader sees it: something to register protocols on. */
const maplibre = { addProtocol: jasmine.createSpy('addProtocol') };

/** Importers that resolve at once to the fakes above, with any of them overridden. */
function importers(
  overrides: Partial<ElevationImporters> = {},
): ElevationImporters {
  return {
    maplibre: () => Promise.resolve(maplibre),
    contour: () =>
      Promise.resolve({
        default: {
          DemSource: FakeDemSource as unknown as typeof mlcontour.DemSource,
        },
      }),
    ...overrides,
  };
}

describe('createElevationLoader', () => {
  beforeEach(() => {
    FakeDemSource.created.length = 0;
  });

  it('opens one DEM source on the Mapterhorn tiles, its worker on', async () => {
    await createElevationLoader(importers(), 4000)();
    expect(FakeDemSource.created.length).toBe(1);
    expect(FakeDemSource.created[0]?.options).toEqual({
      url: MAPTERHORN_DEM.url,
      encoding: 'terrarium',
      maxzoom: 14,
      worker: true,
    });
  });

  it('registers its protocols on maplibre-gl once, however often it is asked', async () => {
    const loader = createElevationLoader(importers(), 4000);
    await loader();
    await loader();
    await loader();
    expect(FakeDemSource.created.length).toBe(1);
    expect(FakeDemSource.created[0]?.setupMaplibre).toHaveBeenCalledOnceWith(
      maplibre,
    );
  });

  it('hands back the shared DEM URL and a contour URL in the style’s contour schema', async () => {
    const tiles = await createElevationLoader(importers(), 4000)();
    expect(tiles).toEqual({
      demTiles: 'dem-shared://{z}/{x}/{y}',
      contourTiles: 'dem-contour://{z}/{x}/{y}?thresholds=11*50*100',
    });
    expect(FakeDemSource.created[0]?.contourOptions).toEqual({
      thresholds: CONTOUR_THRESHOLDS,
      contourLayer: 'contours',
      elevationKey: 'ele',
      levelKey: 'level',
      multiplier: 1,
    });
  });

  it('resolves null, and says why, when a library fails to load', async () => {
    const logged = spyOn(console, 'error');
    const loader = createElevationLoader(
      importers({
        contour: () => Promise.reject(new Error('chunk gone after a redeploy')),
      }),
      4000,
    );
    expect(await loader()).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it('resolves null when the DEM source cannot be set up', async () => {
    spyOn(console, 'error');
    const loader = createElevationLoader(
      importers({
        contour: () =>
          Promise.resolve({
            default: {
              DemSource:
                BrokenDemSource as unknown as typeof mlcontour.DemSource,
            },
          }),
      }),
      4000,
    );
    expect(await loader()).toBeNull();
  });

  it('gives up with null once the timeout passes on a stalled import', fakeAsync(() => {
    const loader = createElevationLoader(
      importers({ maplibre: () => new Promise<never>(() => {}) }),
      4000,
    );
    // Asserted, not inferred, so TypeScript does not narrow it to 'pending' for good.
    let result = 'pending' as ElevationTiles | null | 'pending';
    void loader().then((value) => (result = value));
    tick(3999);
    flushMicrotasks();
    expect(result)
      .withContext('still waiting just before the timeout')
      .toBe('pending');
    tick(1);
    flushMicrotasks();
    expect(result).toBeNull();
  }));

  it('lets a later build pick up a setup that outlasted an earlier timeout', fakeAsync(() => {
    let arrive!: (host: typeof maplibre) => void;
    const loader = createElevationLoader(
      importers({
        maplibre: () => new Promise((resolve) => (arrive = resolve)),
      }),
      4000,
    );
    let first = 'pending' as ElevationTiles | null | 'pending';
    void loader().then((value) => (first = value));
    tick(4000);
    flushMicrotasks();
    expect(first).toBeNull();
    arrive(maplibre);
    flushMicrotasks();
    let second = 'pending' as ElevationTiles | null | 'pending';
    void loader().then((value) => (second = value));
    flushMicrotasks();
    expect(second).toEqual(
      jasmine.objectContaining({ demTiles: 'dem-shared://{z}/{x}/{y}' }),
    );
    expect(FakeDemSource.created.length).toBe(1);
  }));
});
