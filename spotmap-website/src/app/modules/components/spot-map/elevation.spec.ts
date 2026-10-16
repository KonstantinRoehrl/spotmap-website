import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import type mlcontour from 'maplibre-contour';
import {
  CONTOUR_THRESHOLDS,
  createElevationLoader,
  type ElevationImporters,
  demMaxzoomFor,
  type ElevationTiles,
  GLO30_DEM_MAXZOOM,
  MAPTERHORN_DEM,
} from './elevation';
import { CityEnum } from '../../../models/enums/map-enum';

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
    await createElevationLoader(importers(), 4000)(14);
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
    await loader(14);
    await loader(14);
    await loader(14);
    expect(FakeDemSource.created.length).toBe(1);
    expect(FakeDemSource.created[0]?.setupMaplibre).toHaveBeenCalledOnceWith(
      maplibre,
    );
  });

  it('hands back the shared DEM URL and a contour URL in the style’s contour schema', async () => {
    const tiles = await createElevationLoader(importers(), 4000)(14);
    expect(tiles).toEqual({
      demTiles: 'dem-shared://{z}/{x}/{y}',
      contourTiles: 'dem-contour://{z}/{x}/{y}?thresholds=11*50*100',
      demMaxzoom: 14,
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
    expect(await loader(14)).toBeNull();
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
    expect(await loader(14)).toBeNull();
  });

  it('gives up with null once the timeout passes on a stalled import', fakeAsync(() => {
    const loader = createElevationLoader(
      importers({ maplibre: () => new Promise<never>(() => {}) }),
      4000,
    );
    // Asserted, not inferred, so TypeScript does not narrow it to 'pending' for good.
    let result = 'pending' as ElevationTiles | null | 'pending';
    void loader(14).then((value) => (result = value));
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
    void loader(14).then((value) => (first = value));
    tick(4000);
    flushMicrotasks();
    expect(first).toBeNull();
    arrive(maplibre);
    flushMicrotasks();
    let second = 'pending' as ElevationTiles | null | 'pending';
    void loader(14).then((value) => (second = value));
    flushMicrotasks();
    expect(second).toEqual(
      jasmine.objectContaining({ demTiles: 'dem-shared://{z}/{x}/{y}' }),
    );
    expect(FakeDemSource.created.length).toBe(1);
  }));

  it('opens a second DEM source for a city the survey tiles do not reach', async () => {
    const loader = createElevationLoader(importers(), 4000);
    const surveyed = await loader(MAPTERHORN_DEM.maxzoom);
    const planetOnly = await loader(GLO30_DEM_MAXZOOM);
    expect(FakeDemSource.created.map((source) => source.options)).toEqual([
      jasmine.objectContaining({ maxzoom: 14 }),
      jasmine.objectContaining({ maxzoom: 12 }),
    ]);
    expect(surveyed?.demMaxzoom).toBe(14);
    expect(planetOnly?.demMaxzoom).toBe(12);
  });

  it('opens each DEM zoom once however often cities of either kind are visited', async () => {
    const loader = createElevationLoader(importers(), 4000);
    for (const zoom of [14, 12, 14, 12, 12]) {
      await loader(zoom);
    }
    expect(FakeDemSource.created.length).toBe(2);
  });
  it('resolves null, not a throw, when an importer throws synchronously', async () => {
    spyOn(console, 'error');
    const loader = createElevationLoader(
      importers({
        maplibre: () => {
          throw new Error('importer exploded');
        },
      }),
      4000,
    );
    expect(await loader(14)).toBeNull();
    expect(await loader(12)).toBeNull();
  });

  it('resolves every zoom null when the shared import fails', async () => {
    spyOn(console, 'error');
    const loader = createElevationLoader(
      importers({
        contour: () => Promise.reject(new Error('chunk gone after a redeploy')),
      }),
      4000,
    );
    const [survey, planet] = await Promise.all([loader(14), loader(12)]);
    expect(survey).toBeNull();
    expect(planet).toBeNull();
  });
});

describe('demMaxzoomFor', () => {
  it('takes the survey DEMs’ full depth where Mapterhorn has one', () => {
    for (const city of [
      CityEnum.Vienna,
      CityEnum.Salzburg,
      CityEnum.Bratislava,
      CityEnum.Prague,
      CityEnum.Munich,
      CityEnum.Paris,
      CityEnum.Barcelona,
      CityEnum.Lisbon,
    ]) {
      expect(demMaxzoomFor(city)).withContext(city).toBe(14);
    }
  });

  it('stops at the planet archive’s zoom where only Copernicus covers the city', () => {
    for (const city of [
      CityEnum.Split,
      CityEnum.Zagreb,
      CityEnum.Rijeka,
      CityEnum.Zadar,
      CityEnum.Vodice,
      CityEnum.Sibenik,
      CityEnum.Belgrad,
      CityEnum.Sarajevo,
    ]) {
      expect(demMaxzoomFor(city)).withContext(city).toBe(12);
    }
  });
});
