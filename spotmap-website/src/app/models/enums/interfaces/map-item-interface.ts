import { CityEnum, CountryEnum, CountryCodeEnum } from '../map-enum';

/**
 * Holds the city name, country name, ISO 3166-1 alpha-2 country code and optional map link
 */
export interface MapItem {
  city: CityEnum;
  country: CountryEnum;
  countryCode: CountryCodeEnum;
  mapLink: string;
}
