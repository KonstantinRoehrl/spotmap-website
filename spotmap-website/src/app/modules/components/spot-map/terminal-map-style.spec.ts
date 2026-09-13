import {
  buildTerminalStyle,
  OPENFREEMAP_GLYPHS,
  OPENFREEMAP_TILES,
  TERMINAL_PALETTE,
} from './terminal-map-style';

/**
 * The class values OpenFreeMap actually serves, decoded from the real z14 tiles over Vienna
 * centre/Stadtpark, the Prater, Schoenbrunn, the Donaupark and the Lobau
 * (`https://tiles.openfreemap.org/planet/20260906_080001_pt/14/{x}/{y}.pbf`). In the
 * OpenMapTiles schema `landuse` carries the built environment only; park, grass and wood
 * arrive in `landcover`, where park sits under class `grass`.
 */
const SERVED_CLASSES: Record<string, readonly string[]> = {
  landcover: ['farmland', 'grass', 'sand', 'wetland', 'wood'],
  landuse: [
    'commercial',
    'education',
    'hospital',
    'industrial',
    'kindergarten',
    'library',
    'military',
    'neighbourhood',
    'pitch',
    'playground',
    'railway',
    'residential',
    'retail',
    'school',
    'stadium',
    'suburb',
    'theme_park',
    'track',
    'university',
    'zoo',
  ],
  park: ['historic', 'nature_monument', 'nature_reserve', 'protected_area'],
};

/** The values an `['in', ['get', 'class'], ['literal', [...]]]` filter matches on. */
function filteredClasses(layer: unknown): readonly string[] {
  const filter = (layer as { filter?: unknown[] }).filter ?? [];
  const literal = filter.find(
    (part): part is [string, string[]] =>
      Array.isArray(part) && part[0] === 'literal',
  );
  return literal ? literal[1] : [];
}

describe('buildTerminalStyle', () => {
  const style = buildTerminalStyle();

  it('sources vector tiles from OpenFreeMap and declares no sprite', () => {
    expect(style.sources['openmaptiles']).toEqual({
      type: 'vector',
      url: OPENFREEMAP_TILES,
    });
    expect(style.glyphs).toBe(OPENFREEMAP_GLYPHS);
    expect(style.sprite).toBeUndefined();
  });

  it('paints a true-black ground', () => {
    const background = style.layers.find((l) => l.id === 'background');
    expect(background).toBeDefined();
    expect(
      (background as { paint: Record<string, unknown> }).paint[
        'background-color'
      ],
    ).toBe('#000000');
  });

  it('uses no white or near-white colour anywhere', () => {
    const serialized = JSON.stringify(style).toLowerCase();
    for (const banned of ['#fff', '#ffffff', 'white', '#fefefe', '#f8f8f8']) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('declares every colour as hex, never oklch', () => {
    expect(JSON.stringify(style)).not.toContain('oklch');
  });

  it('draws water, roads, buildings and street labels', () => {
    const sourceLayers = new Set(
      style.layers
        .map((l) => (l as { 'source-layer'?: string })['source-layer'])
        .filter(Boolean),
    );
    for (const expected of [
      'water',
      'landcover',
      'building',
      'transportation',
      'transportation_name',
      'place',
    ]) {
      expect(sourceLayers).toContain(expected);
    }
  });

  it('paints parks, woods and grass in surface-raised', () => {
    const green = style.layers.find((l) => l.id === 'landcover') as {
      'source-layer'?: string;
      paint: Record<string, unknown>;
    };
    expect(green).toBeDefined();
    expect(green['source-layer']).toBe('landcover');
    expect(filteredClasses(green)).toEqual(['grass', 'wood']);
    expect(green.paint['fill-color']).toBe(TERMINAL_PALETTE.surfaceRaised);
  });

  it('filters green space only on classes the tiles actually serve', () => {
    const greenFills = style.layers.filter(
      (l) =>
        (l as { paint?: Record<string, unknown> }).paint?.['fill-color'] ===
        TERMINAL_PALETTE.surfaceRaised,
    );
    expect(greenFills.length).toBeGreaterThan(0);
    for (const layer of greenFills) {
      const sourceLayer =
        (layer as { 'source-layer'?: string })['source-layer'] ?? '';
      const served = SERVED_CLASSES[sourceLayer] ?? [];
      const filtered = filteredClasses(layer);
      expect(filtered.length)
        .withContext(`${layer.id} matches every feature in ${sourceLayer}`)
        .toBeGreaterThan(0);
      for (const cls of filtered) {
        expect(served)
          .withContext(`${layer.id} filters ${sourceLayer}.class on "${cls}"`)
          .toContain(cls);
      }
    }
  });

  it('draws green space above water and below the buildings', () => {
    const order = style.layers.map((l) => l.id);
    expect(order.indexOf('landcover')).toBeGreaterThan(order.indexOf('water'));
    expect(order.indexOf('landcover')).toBeLessThan(order.indexOf('building'));
  });

  it('labels in an uppercase, letterspaced treatment', () => {
    const label = style.layers.find((l) => l.id === 'street-label') as {
      layout: Record<string, unknown>;
    };
    expect(label.layout['text-transform']).toBe('uppercase');
    expect(label.layout['text-letter-spacing']).toBeGreaterThan(0);
    expect(label.layout['text-font']).toEqual(['Noto Sans Regular']);
  });
});
