import { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import { CityEnum } from '../../../models/enums/map-enum';
import {
  parseCity,
  SUPPORTED_CITIES,
} from '../../../models/map/supported-cities';
import { safeLocalStorage } from '../../../utils/safe-storage';

/** The localStorage key holding the visitor's last city, a `CityEnum` value. */
export const USER_CITY_STORAGE_KEY = 'userCity';

/**
 * The city remembered from the last visit, when localStorage holds one that is still a supported
 * city; Vienna otherwise (nothing stored, an unknown key, or storage unavailable). The answer is
 * always one of the `SUPPORTED_CITIES` entries, so the picker's `mat-select` matches it by
 * reference.
 */
export function readStoredCity(): MapItem {
  const stored = safeLocalStorage.getItem(USER_CITY_STORAGE_KEY);
  return (
    (stored === null ? null : parseCity(stored)) ??
    SUPPORTED_CITIES[CityEnum.Vienna]
  );
}

/** Remembers `city` for the next visit; storage that refuses the write is not an error. */
export function storeCity(city: CityEnum): void {
  safeLocalStorage.setItem(USER_CITY_STORAGE_KEY, city);
}
