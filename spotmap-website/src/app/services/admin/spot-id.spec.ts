import { slugify, spotId } from './spot-id';

/**
 * Every expected value below is what tools/extract-spots/ids.mjs returns for the same input; the
 * golden ids are real spots from the bundled snapshots.
 */
describe('spot-id', () => {
  describe('slugify', () => {
    const cases: [string, string][] = [
      ['Hbf Curb', 'hbf-curb'],
      ['Perfect 8 Stair', 'perfect-8-stair'],
      ['Holzbenches überdacht', 'holzbenches-ueberdacht'],
      [
        'Grießkirchen: Möbelhändler Manny Pad',
        'griesskirchen-moebelhaendler-manny-pad',
      ],
      ['ÜBER STRASSE', 'ueber-strasse'],
      ['über', 'ueber'],
      ['Café Crème', 'cafe-creme'],
      ['São João', 'sao-joao'],
      ['Łódź Rail', 'odz-rail'],
      ['  --Ledge!!  ', 'ledge'],
      ['!!!', 'spot'],
      ['', 'spot'],
    ];

    for (const [name, slug] of cases) {
      it(`slugs ${JSON.stringify(name)} as ${JSON.stringify(slug)}`, () => {
        expect(slugify(name)).toBe(slug);
      });
    }
  });

  describe('spotId', () => {
    const golden: [string, number, number, string][] = [
      ['Hbf Curb', 16.3785491, 48.1840844, 'hbf-curb-99f6e5'],
      [
        'Holzbenches überdacht',
        2.2019649,
        41.4479578,
        'holzbenches-ueberdacht-ae1242',
      ],
      ['Round Fountain', -9.1521139, 38.7085027, 'round-fountain-1a519e'],
      ['Perfect 8 Stair', 14.43912, 50.09078, 'perfect-8-stair-8688f3'],
      ['Fondo', 2.2247261, 41.4533376, 'fondo-55a629'],
      [
        'Grießkirchen: Möbelhändler Manny Pad',
        13.8438188,
        48.2266596,
        'griesskirchen-moebelhaendler-manny-pad-107548',
      ],
    ];

    for (const [name, lng, lat, id] of golden) {
      it(`reproduces the bundled id ${id}`, () => {
        expect(spotId(name, { lng, lat })).toBe(id);
      });
    }

    it('rounds the coordinates to 6 decimals before hashing', () => {
      expect(spotId('Hbf Curb', { lng: 16.37854912, lat: 48.18408438 })).toBe(
        'hbf-curb-99f6e5',
      );
    });

    it('gives a spot moved by 0.000001° another id', () => {
      expect(spotId('Hbf Curb', { lng: 16.3785501, lat: 48.1840844 })).toBe(
        'hbf-curb-4392b1',
      );
    });

    it('keeps toFixed’s "-0.000000" so the id matches the extractor’s', () => {
      expect(spotId('Fondo', { lng: -0.0000001, lat: 0 })).toBe('fondo-1e9f77');
      expect(spotId('Fondo', { lng: 0, lat: 0 })).toBe('fondo-b81ecc');
    });
  });
});
