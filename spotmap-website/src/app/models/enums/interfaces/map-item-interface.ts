import {
  CityEnum,
  CountryEnum,
  CountryCodeEnum,
  MapRendererEnum,
} from '../map-enum';

/**
 * Holds the city name, country name, ISO 3166-1 alpha-2 country code, the map link and
 * which renderer draws the city's map.
 */
export interface MapItem {
  city: CityEnum;
  country: CountryEnum;
  countryCode: CountryCodeEnum;
  mapLink: string;
  renderer: MapRendererEnum;
}
