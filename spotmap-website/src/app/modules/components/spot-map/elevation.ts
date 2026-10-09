import type mlcontour from 'maplibre-contour';

/** maplibre-contour's DEM source; the loader creates exactly one per page. */
type DemSource = InstanceType<typeof mlcontour.DemSource>;

/**
 * What `DemSource.setupMaplibre()` registers its protocols on: the maplibre-gl module, narrowed
 * to the one function the library calls.
 */
export type ProtocolHost = Parameters<DemSource['setupMaplibre']>[0];

/**
 * The terrain provider: Mapterhorn's keyless terrarium tiles. Swapping provider — AWS Terrain
 * Tiles, or a self-hosted PMTiles extract of Vienna — is a change to this constant alone. Vienna's
 * z13+ terrain is BEV ALS-DGM 1 m (Mapterhorn source `at1`, CC BY 4.0) and the z0–12 planet
 * archive is built over Copernicus GLO-30, so the attribution credits both.
 */
export const MAPTERHORN_DEM = {
  url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
  encoding: 'terrarium',
  tileSize: 512,
  /** Smoother contours, and a faint hillshade gains nothing beyond it. */
  maxzoom: 14,
  attribution:
    '<a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener">© Mapterhorn</a>' +
    ' · DGM © BEV (CC BY 4.0)' +
    ' · Copernicus GLO-30 © DLR e.V. 2010–2014, © Airbus Defence and Space GmbH 2014–2018,' +
    ' provided under COPERNICUS by the EU and ESA',
} as const;

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
}

/** Resolves the elevation tile URLs, or `null` when elevation is unavailable. Never rejects. */
export type ElevationLoader = () => Promise<ElevationTiles | null>;

/** The two lazy imports the loader needs, passed in so specs can drive it with fakes. */
export interface ElevationImporters {
  readonly maplibre: () => Promise<ProtocolHost>;
  readonly contour: () => Promise<{
    readonly default: Pick<typeof mlcontour, 'DemSource'>;
  }>;
}

/**
 * Builds the page's elevation loader. The first call imports both libraries, creates one
 * `DemSource` with its worker on and registers its protocols on maplibre-gl; every later call
 * reuses that setup, because a protocol can only be registered once per page. A call resolves
 * `null` instead of rejecting — on an import or setup failure, or when `timeoutMs` passes first —
 * because elevation is decoration and the map draws without it. A setup that outlasts one call's
 * timeout keeps running, so a later build (a RETRY, a city switch) still picks it up.
 */
export function createElevationLoader(
  importers: ElevationImporters,
  timeoutMs: number,
): ElevationLoader {
  let setup: Promise<ElevationTiles | null> | undefined;
  return () => {
    setup ??= setUpElevation(importers);
    return resolveWithin(setup, timeoutMs);
  };
}

/**
 * Imports both libraries, creates the page's one `DemSource` and registers its protocols.
 * Resolves `null`, after logging the cause, on any failure.
 */
async function setUpElevation(
  importers: ElevationImporters,
): Promise<ElevationTiles | null> {
  try {
    const [maplibre, contour] = await Promise.all([
      importers.maplibre(),
      importers.contour(),
    ]);
    const demSource = new contour.default.DemSource({
      url: MAPTERHORN_DEM.url,
      encoding: MAPTERHORN_DEM.encoding,
      maxzoom: MAPTERHORN_DEM.maxzoom,
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
