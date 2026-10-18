import { TestBed } from '@angular/core/testing';
import type { RasterSourceSpecification } from 'maplibre-gl';

import {
  buildImageryStyle,
  ESRI_WORLD_IMAGERY,
  IMAGERY_CONFIG,
  IMAGERY_SOURCE_ID,
  ImageryConfig,
} from './imagery';

const ESRI_TEMPLATE =
  'https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/arcgis/imagery/static/tile/{z}/{y}/{x}';

/** The style's imagery source, typed as the raster source it must be. */
function imagerySource(
  config: ImageryConfig,
  token: string | null,
): RasterSourceSpecification {
  return buildImageryStyle(config, token).sources[
    IMAGERY_SOURCE_ID
  ] as RasterSourceSpecification;
}

describe('imagery', () => {
  describe('ESRI_WORLD_IMAGERY', () => {
    it('points at the static basemap tiles service’s imagery style', () => {
      expect(ESRI_WORLD_IMAGERY.tileUrlTemplate).toBe(ESRI_TEMPLATE);
    });

    it('serves 512 px tiles down to zoom 19', () => {
      expect(ESRI_WORLD_IMAGERY.tileSize).toBe(512);
      expect(ESRI_WORLD_IMAGERY.maxZoom).toBe(19);
    });

    it('credits Esri and the imagery providers', () => {
      expect(ESRI_WORLD_IMAGERY.attribution).toBe(
        'Powered by <a href="https://www.esri.com">Esri</a> | Esri, Vantor, Earthstar Geographics, and the GIS User Community',
      );
    });

    it('reads its key from the esri_api_key admin setting', () => {
      expect(ESRI_WORLD_IMAGERY.tokenSetting).toBe('esri_api_key');
    });
  });

  it('defaults IMAGERY_CONFIG to Esri World Imagery', () => {
    expect(TestBed.inject(IMAGERY_CONFIG)).toBe(ESRI_WORLD_IMAGERY);
  });

  describe('buildImageryStyle', () => {
    it('builds a version 8 style with one raster layer drawing the imagery source', () => {
      const style = buildImageryStyle(ESRI_WORLD_IMAGERY, null);

      expect(style.version).toBe(8);
      expect(Object.keys(style.sources)).toEqual([IMAGERY_SOURCE_ID]);
      expect(style.layers).toEqual([
        { id: 'imagery', type: 'raster', source: IMAGERY_SOURCE_ID },
      ]);
    });

    it('requests the template as is when there is no token', () => {
      expect(imagerySource(ESRI_WORLD_IMAGERY, null).tiles).toEqual([
        ESRI_TEMPLATE,
      ]);
    });

    it('treats an empty token as none', () => {
      expect(imagerySource(ESRI_WORLD_IMAGERY, '').tiles).toEqual([
        ESRI_TEMPLATE,
      ]);
    });

    it('appends the token URL-encoded as ?token=', () => {
      expect(imagerySource(ESRI_WORLD_IMAGERY, 'AAPK a+b/c&d').tiles).toEqual([
        `${ESRI_TEMPLATE}?token=AAPK%20a%2Bb%2Fc%26d`,
      ]);
    });

    it('carries the tile size, max zoom and attribution onto the raster source', () => {
      const source = imagerySource(ESRI_WORLD_IMAGERY, 'key');

      expect(source.type).toBe('raster');
      expect(source.tileSize).toBe(512);
      expect(source.maxzoom).toBe(19);
      expect(source.attribution).toBe(ESRI_WORLD_IMAGERY.attribution);
    });

    it('follows the config it is given rather than Esri’s', () => {
      const keyless: ImageryConfig = {
        tileUrlTemplate: 'https://tiles.example/{z}/{x}/{y}.jpg',
        tileSize: 256,
        maxZoom: 17,
        attribution: '© Example',
        tokenSetting: null,
      };

      const source = imagerySource(keyless, null);

      expect(source.tiles).toEqual(['https://tiles.example/{z}/{x}/{y}.jpg']);
      expect(source.tileSize).toBe(256);
      expect(source.maxzoom).toBe(17);
      expect(source.attribution).toBe('© Example');
    });
  });
});
