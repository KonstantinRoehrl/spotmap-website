import { CityEnum, CountryEnum, FlagEnum } from "../map-enum";

/**
 * Holds the city name, country name and optional map link
 */
export interface MapItem {
    city: CityEnum,
    country: CountryEnum,
    flag: FlagEnum,
    mapLink: string
}