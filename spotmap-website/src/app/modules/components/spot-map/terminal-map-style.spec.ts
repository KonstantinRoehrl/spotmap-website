import { buildTerminalStyle, OPENFREEMAP_GLYPHS, OPENFREEMAP_TILES } from './terminal-map-style';

describe('buildTerminalStyle', () => {
  const style = buildTerminalStyle();

  it('sources vector tiles from OpenFreeMap and declares no sprite', () => {
    expect(style.sources['openmaptiles']).toEqual({ type: 'vector', url: OPENFREEMAP_TILES });
    expect(style.glyphs).toBe(OPENFREEMAP_GLYPHS);
    expect(style.sprite).toBeUndefined();
  });

  it('paints a true-black ground', () => {
    const background = style.layers.find((l) => l.id === 'background');
    expect(background).toBeDefined();
    expect((background as { paint: Record<string, unknown> }).paint['background-color']).toBe('#000000');
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
      style.layers.map((l) => (l as { 'source-layer'?: string })['source-layer']).filter(Boolean),
    );
    for (const expected of ['water', 'landuse', 'building', 'transportation', 'transportation_name', 'place']) {
      expect(sourceLayers).toContain(expected);
    }
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
