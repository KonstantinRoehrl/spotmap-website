import { InjectionToken } from '@angular/core';
import type { StyleSpecification } from 'maplibre-gl';

/**
 * The satellite imagery the admin picker draws: a raster tile service and how to credit it. Holds
 * no secret — a keyed service names the `admin_settings` row its key lives in, and the key is read
 * after an admin signs in (`AdminRepository.imageryToken`).
 */
export interface ImageryConfig {
  /** The tile URL with `{z}`, `{y}` and `{x}` placeholders and no query string. */
  tileUrlTemplate: string;
  /** The tiles' edge in pixels. */
  tileSize: 256 | 512;
  /** The deepest zoom the service serves; MapLibre over-zooms beyond it. */
  maxZoom: number;
  /** The credit line MapLibre's attribution control shows (HTML). */
  attribution: string;
  /** The `admin_settings` key holding the service's access token, or null for a keyless service. */
  tokenSetting: string | null;
}

/**
 * Esri World Imagery through the static basemap tiles service: 512 px tiles, credited the way the
 * World_Imagery service's `copyrightText` reads. Untokened requests get 401, so the referrer-
 * restricted key stored as `admin_settings.esri_api_key` is appended as `?token=`.
 */
export const ESRI_WORLD_IMAGERY: ImageryConfig = {
  tileUrlTemplate:
    'https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/arcgis/imagery/static/tile/{z}/{y}/{x}',
  tileSize: 512,
  maxZoom: 19,
  attribution:
    'Powered by <a href="https://www.esri.com">Esri</a> | Esri, Vantor, Earthstar Geographics, and the GIS User Community',
  tokenSetting: 'esri_api_key',
};

/**
 * The imagery the satellite picker draws. app.config.ts provides the build environment's value;
 * anything that does not — specs — gets {@link ESRI_WORLD_IMAGERY}, a plain value that drags no
 * library into a spec bundle.
 */
export const IMAGERY_CONFIG = new InjectionToken<ImageryConfig>(
  'IMAGERY_CONFIG',
  { providedIn: 'root', factory: () => ESRI_WORLD_IMAGERY },
);

/** The id of the imagery's raster source in {@link buildImageryStyle}'s style. */
export const IMAGERY_SOURCE_ID = 'imagery';

/** The id of the one raster layer drawing {@link IMAGERY_SOURCE_ID}. */
const IMAGERY_LAYER_ID = 'imagery';

/**
 * The picker map's whole style: one raster source and one raster layer, nothing else.
 *
 * @param config the imagery service
 * @param token the service's access token, appended URL-encoded as `?token=`; null or empty for none
 * @returns a MapLibre style (version 8)
 */
export function buildImageryStyle(
  config: ImageryConfig,
  token: string | null,
): StyleSpecification {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return {
    version: 8,
    sources: {
      [IMAGERY_SOURCE_ID]: {
        type: 'raster',
        tiles: [`${config.tileUrlTemplate}${query}`],
        tileSize: config.tileSize,
        maxzoom: config.maxZoom,
        attribution: config.attribution,
      },
    },
    layers: [
      { id: IMAGERY_LAYER_ID, type: 'raster', source: IMAGERY_SOURCE_ID },
    ],
  };
}
