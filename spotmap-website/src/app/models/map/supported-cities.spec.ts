import { CityEnum } from '../enums/map-enum';
import { parseCity, SUPPORTED_CITIES } from './supported-cities';

describe('parseCity', () => {
  it('answers a supported slug with its entry, by reference', () => {
    expect(parseCity(CityEnum.Graz)).toBe(SUPPORTED_CITIES[CityEnum.Graz]);
  });

  it('answers null for a slug the app has no map for', () => {
    expect(parseCity('atlantis')).toBeNull();
    expect(parseCity('')).toBeNull();
  });

  it('never reaches an Object.prototype member', () => {
    expect(parseCity('constructor')).toBeNull();
    expect(parseCity('toString')).toBeNull();
  });
});
