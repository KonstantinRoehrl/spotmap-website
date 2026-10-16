import { MapItem } from './interfaces/map-item-interface';
import { CityEnum, CountryEnum, CountryCodeEnum } from './map-enum';

/** Every city's picker entry; the picker lists them in this order, grouped by country. */
export const SUPPORTED_CITIES: Record<CityEnum, MapItem> = {
  [CityEnum.Vienna]: {
    city: CityEnum.Vienna,
    country: CountryEnum.Austria,
    countryCode: CountryCodeEnum.Austria,
  },
  [CityEnum.Graz]: {
    city: CityEnum.Graz,
    country: CountryEnum.Austria,
    countryCode: CountryCodeEnum.Austria,
  },
  [CityEnum.Linz]: {
    city: CityEnum.Linz,
    country: CountryEnum.Austria,
    countryCode: CountryCodeEnum.Austria,
  },
  [CityEnum.Salzburg]: {
    city: CityEnum.Salzburg,
    country: CountryEnum.Austria,
    countryCode: CountryCodeEnum.Austria,
  },
  [CityEnum.Bratislava]: {
    city: CityEnum.Bratislava,
    country: CountryEnum.Slovakia,
    countryCode: CountryCodeEnum.Slovakia,
  },
  [CityEnum.Prague]: {
    city: CityEnum.Prague,
    country: CountryEnum.Czech,
    countryCode: CountryCodeEnum.Czech,
  },
  [CityEnum.Zagreb]: {
    city: CityEnum.Zagreb,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
  },
  [CityEnum.Rijeka]: {
    city: CityEnum.Rijeka,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
  },
  [CityEnum.Split]: {
    city: CityEnum.Split,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
  },
  [CityEnum.Zadar]: {
    city: CityEnum.Zadar,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
  },
  [CityEnum.Vodice]: {
    city: CityEnum.Vodice,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
  },
  [CityEnum.Sibenik]: {
    city: CityEnum.Sibenik,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
  },
  [CityEnum.Belgrad]: {
    city: CityEnum.Belgrad,
    country: CountryEnum.Serbia,
    countryCode: CountryCodeEnum.Serbia,
  },
  [CityEnum.Sarajevo]: {
    city: CityEnum.Sarajevo,
    country: CountryEnum.Bosnia,
    countryCode: CountryCodeEnum.Bosnia,
  },
  [CityEnum.Lisbon]: {
    city: CityEnum.Lisbon,
    country: CountryEnum.Portugal,
    countryCode: CountryCodeEnum.Portugal,
  },
  [CityEnum.Paris]: {
    city: CityEnum.Paris,
    country: CountryEnum.France,
    countryCode: CountryCodeEnum.France,
  },
  [CityEnum.Munich]: {
    city: CityEnum.Munich,
    country: CountryEnum.Germany,
    countryCode: CountryCodeEnum.Germany,
  },
  [CityEnum.Barcelona]: {
    city: CityEnum.Barcelona,
    country: CountryEnum.Spain,
    countryCode: CountryCodeEnum.Spain,
  },
  [CityEnum.Valencia]: {
    city: CityEnum.Valencia,
    country: CountryEnum.Spain,
    countryCode: CountryCodeEnum.Spain,
  },
};
