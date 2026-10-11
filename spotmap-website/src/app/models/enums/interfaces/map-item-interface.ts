import { CityEnum, CountryEnum, CountryCodeEnum } from '../map-enum';

/**
 * One city's entry in the picker: the city, its country and that country's ISO 3166-1 alpha-2
 * code. The map itself is always drawn by `SpotMapComponent` from `spots/<city>.geojson`.
 */
export interface MapItem {
  city: CityEnum;
  country: CountryEnum;
  countryCode: CountryCodeEnum;
}
