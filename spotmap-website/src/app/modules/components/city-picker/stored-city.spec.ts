import { CityEnum } from '../../../models/enums/map-enum';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import {
  readStoredCity,
  storeCity,
  USER_CITY_STORAGE_KEY,
} from './stored-city';

describe('stored city', () => {
  afterEach(() => localStorage.removeItem(USER_CITY_STORAGE_KEY));

  it('falls back to Vienna when nothing is stored', () => {
    localStorage.removeItem(USER_CITY_STORAGE_KEY);
    expect(readStoredCity()).toBe(SUPPORTED_CITIES[CityEnum.Vienna]);
  });

  it('restores the stored city as its own picker entry', () => {
    localStorage.setItem(USER_CITY_STORAGE_KEY, CityEnum.Split);
    expect(readStoredCity()).toBe(SUPPORTED_CITIES[CityEnum.Split]);
  });

  it('falls back to Vienna for a key that is not a supported city', () => {
    for (const stored of ['atlantis', 'constructor', '']) {
      localStorage.setItem(USER_CITY_STORAGE_KEY, stored);
      expect(readStoredCity())
        .withContext(stored)
        .toBe(SUPPORTED_CITIES[CityEnum.Vienna]);
    }
  });

  it('falls back to Vienna when localStorage.getItem throws', () => {
    spyOn(localStorage, 'getItem').and.throwError('SecurityError');
    expect(readStoredCity()).toBe(SUPPORTED_CITIES[CityEnum.Vienna]);
  });

  it('remembers a city under the userCity key', () => {
    storeCity(CityEnum.Graz);
    expect(localStorage.getItem('userCity')).toBe('graz');
  });

  it('does not throw when localStorage.setItem throws', () => {
    spyOn(localStorage, 'setItem').and.throwError('QuotaExceeded');
    expect(() => storeCity(CityEnum.Graz)).not.toThrow();
  });
});
