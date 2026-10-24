import type mlcontour from 'maplibre-contour';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import { CityEnum, CountryCodeEnum } from '../../../models/enums/map-enum';

/** maplibre-contour's DEM source; the loader creates one per DEM zoom, so at most two per page. */
type DemSource = InstanceType<typeof mlcontour.DemSource>;

/**
 * What `DemSource.setupMaplibre()` registers its protocols on: the maplibre-gl module, narrowed
 * to the one function the library calls.
 */
export type ProtocolHost = Parameters<DemSource['setupMaplibre']>[0];

/**
 * The terrain provider: Mapterhorn's keyless terrarium tiles. Swapping provider — AWS Terrain
 * Tiles, or a self-hosted PMTiles extract — is a change to this constant alone. Mapterhorn serves
 * z13+ from national survey DEMs where it has one, and the z0–12 planet archive from Copernicus
 * GLO-30. The attribution credits every survey that may cover one of the picker's cities, per
 * Mapterhorn's attribution.json (read 2026-10-10): BEV, Land Oberösterreich and Land Salzburg for
 * Austria, ÚGKK SR for Bratislava, ČÚZK for Prague, Bayerische Vermessungsverwaltung for Munich,
 * IGN for Paris, scne.es for Barcelona and Valencia, and Direção-Geral do Território for Lisbon.
 * The Croatian, Serbian and Bosnian cities have no survey source there and use GLO-30 alone. A city
 * in a new country means checking that list again.
 */
export const MAPTERHORN_DEM = {
  url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
  encoding: 'terrarium',
  tileSize: 512,
  /**
   * The deepest tiles Mapterhorn serves anywhere, which is only where a survey DEM exists —
   * smoother contours than the planet archive, and a faint hillshade gains nothing beyond it.
   * Use {@link demMaxzoomFor} for a city: elsewhere the tiles stop at {@link GLO30_DEM_MAXZOOM},
   * and asking for deeper ones is a 404 per tile.
   */
  maxzoom: 14,
  attribution:
    '<a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener">© Mapterhorn</a>' +
    ' · DGM © BEV, Land Oberösterreich, Land Salzburg (CC BY 4.0)' +
    ' · DMR 5.0 © ÚGKK SR (CC BY 4.0)' +
    ' · DMR 4G © ČÚZK (CC BY 4.0)' +
    ' · DGM1 © Bayerische Vermessungsverwaltung (CC BY 4.0)' +
    ' · RGE ALTI®, LiDAR HD © IGN (Licence Ouverte 2.0)' +
    ' · MDT © scne.es (CC BY 4.0)' +
    ' · MDT © Direção-Geral do Território (CC BY 4.0)' +
    ' · Copernicus GLO-30 © DLR e.V. 2010–2014, © Airbus Defence and Space GmbH 2014–2018,' +
    ' provided under COPERNICUS by the EU and ESA',
} as const;

/** The deepest zoom of the planet archive, which is Copernicus GLO-30 alone. */
export const GLO30_DEM_MAXZOOM = 12;

/**
 * The countries whose cities have no survey DEM at Mapterhorn, so only the planet archive covers
 * them (see {@link MAPTERHORN_DEM}). A country missing here is asked for survey depth, which costs
 * a few 404s if Mapterhorn turns out not to have one and never costs detail where it does; a city
 * in a new country means checking Mapterhorn's attribution list again.
 */
const GLO30_ONLY_COUNTRIES: ReadonlySet<CountryCodeEnum> = new Set([
  CountryCodeEnum.Croatia,
  CountryCodeEnum.Serbia,
  CountryCodeEnum.Bosnia,
]);

/**
 * The deepest DEM zoom that exists for a city: the survey depth where Mapterhorn has a survey
 * source for its country, and the planet archive's depth where it does not. Past it MapLibre
 * overzooms what it has instead of requesting tiles Mapterhorn will 404.
 */
export function demMaxzoomFor(city: CityEnum): number {
  return GLO30_ONLY_COUNTRIES.has(SUPPORTED_CITIES[city].countryCode)
    ? GLO30_DEM_MAXZOOM
    : MAPTERHORN_DEM.maxzoom;
}

/**
 * `[minor, major]` contour spacing in metres, keyed by the zoom it starts at: maplibre-contour
 * carries each entry up to the next key, and draws nothing below the first.
 */
export const CONTOUR_THRESHOLDS = {
  11: [50, 100],
  13: [25, 100],
  15: [10, 50],
};

/** The vector-tile layer the generated contour lines arrive in. */
export const CONTOUR_SOURCE_LAYER = 'contours';

/** The contour property carrying the line's elevation, in metres. */
export const CONTOUR_ELEVATION_KEY = 'ele';

/** The contour property carrying the line's weight: 0 minor, 1 major. */
export const CONTOUR_LEVEL_KEY = 'level';

/** Contour tiles are generated up to this zoom and overzoomed beyond it. */
export const CONTOUR_MAXZOOM = 15;

/** The tile URLs the basemap style needs to draw elevation. */
export interface ElevationTiles {
  /**
   * The DEM tile URL the hillshade reads: maplibre-contour's shared-DEM protocol, so hillshade
   * and contours share one fetch and one cache per tile.
   */
  readonly demTiles: string;
  /** The contour tile URL, generated in a worker from the same DEM. */
  readonly contourTiles: string;
  /** The deepest DEM zoom these URLs reach; the style must not ask the DEM source past it. */
  readonly demMaxzoom: number;
}

/**
 * Resolves the elevation tile URLs for a DEM of the given depth ({@link demMaxzoomFor}), or `null`
 * when elevation is unavailable. Never rejects.
 */
export type ElevationLoader = (
  demMaxzoom: number,
) => Promise<ElevationTiles | null>;

/** The two libraries the loader sets a DEM source up from, once imported. */
type ImportedLibraries = readonly [
  Awaited<ReturnType<ElevationImporters['maplibre']>>,
  Awaited<ReturnType<ElevationImporters['contour']>>,
];

/** The two lazy imports the loader needs, passed in so specs can drive it with fakes. */
export interface ElevationImporters {
  readonly maplibre: () => Promise<ProtocolHost>;
  readonly contour: () => Promise<{
    readonly default: Pick<typeof mlcontour, 'DemSource'>;
  }>;
}

/**
 * Builds the page's elevation loader. The first call imports both libraries; each DEM zoom asked
 * for creates one `DemSource` with its worker on and registers its protocols on maplibre-gl, and
 * every later call for that zoom reuses it, because a protocol can only be registered once per
 * source. The two zooms in use are two sources, since a source overzooms from its own `maxzoom`
 * and cannot serve a city with survey tiles and one without. A call resolves `null` instead of
 * rejecting — on an import or setup failure, or when `timeoutMs` passes first — because elevation
 * is decoration and the map draws without it. A setup that outlasts one call's timeout keeps
 * running, so a later build (a RETRY, a city switch) still picks it up.
 */
export function createElevationLoader(
  importers: ElevationImporters,
  timeoutMs: number,
): ElevationLoader {
  let libraries: Promise<ImportedLibraries> | undefined;
  const setups = new Map<number, Promise<ElevationTiles | null>>();
  return (demMaxzoom) => {
    libraries ??= importLibraries(importers);
    let setup = setups.get(demMaxzoom);
    if (!setup) {
      setup = setUpElevation(libraries, demMaxzoom);
      setups.set(demMaxzoom, setup);
    }
    return resolveWithin(setup, timeoutMs);
  };
}

/**
 * Imports both libraries. Async so that an importer throwing synchronously rejects rather than
 * escaping the loader, which promises never to throw.
 */
async function importLibraries(
  importers: ElevationImporters,
): Promise<ImportedLibraries> {
  return Promise.all([importers.maplibre(), importers.contour()]);
}

/**
 * Creates the page's `DemSource` for one DEM zoom and registers its protocols. Resolves `null`,
 * after logging the cause, on any failure — including the import having failed.
 */
async function setUpElevation(
  libraries: Promise<ImportedLibraries>,
  demMaxzoom: number,
): Promise<ElevationTiles | null> {
  try {
    const [maplibre, contour] = await libraries;
    const demSource = new contour.default.DemSource({
      url: MAPTERHORN_DEM.url,
      encoding: MAPTERHORN_DEM.encoding,
      maxzoom: demMaxzoom,
      worker: true,
    });
    demSource.setupMaplibre(maplibre);
    return {
      demTiles: demSource.sharedDemProtocolUrl,
      contourTiles: demSource.contourProtocolUrl({
        thresholds: CONTOUR_THRESHOLDS,
        contourLayer: CONTOUR_SOURCE_LAYER,
        elevationKey: CONTOUR_ELEVATION_KEY,
        levelKey: CONTOUR_LEVEL_KEY,
        multiplier: 1,
      }),
      demMaxzoom,
    };
  } catch (error) {
    // Catching the failure took the browser's own report of it away, and the map goes on to
    // draw without elevation, so this line is the only place the cause is ever named.
    console.error(error);
    return null;
  }
}

/** `pending`'s value, or `null` once `timeoutMs` passes first. */
function resolveWithin<T>(
  pending: Promise<T | null>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    void pending.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
