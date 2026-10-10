/** Every city the site has a map for. The value is the URL slug and the picker's label. */
export enum CityEnum {
  // Austria
  Vienna = 'vienna',
  Graz = 'graz',
  Linz = 'linz',
  Salzburg = 'salzburg',
  // Slovakia
  Bratislava = 'bratislava',
  // Czech
  Prague = 'prague',
  // Croatia
  Split = 'split',
  Zagreb = 'zagreb',
  Rijeka = 'rijeka',
  /** Spots come from the shared "Spotmap Balkan" map, placemarks prefixed `Zadar:`. */
  Zadar = 'zadar',
  /** Spots come from the shared "Spotmap Balkan" map, placemarks prefixed `Vodice:`. */
  Vodice = 'vodice',
  /** Spots come from the shared "Spotmap Balkan" map, placemarks prefixed `Sibenik:`. */
  Sibenik = 'sibenik',
  // Serbia
  Belgrad = 'belgrade',
  // Bosnia
  Sarajevo = 'sarajevo',
  // Portugal
  Lisbon = 'lisbon',
  // France
  Paris = 'paris',
  // Germany
  Munich = 'munich',
  // Spain
  Barcelona = 'barcelona',
  Valencia = 'valencia',
}

/** Countries the picker groups cities by. */
export enum CountryEnum {
  Austria = 'austria',
  Slovakia = 'slovakia',
  Czech = 'czech',
  Croatia = 'croatia',
  Serbia = 'serbia',
  Bosnia = 'bosnia',
  Portugal = 'portugal',
  France = 'france',
  Germany = 'germany',
  Spain = 'spain',
}

/** ISO 3166-1 alpha-2 code of each {@link CountryEnum}. */
export enum CountryCodeEnum {
  Austria = 'AT',
  Slovakia = 'SK',
  Czech = 'CZ',
  Croatia = 'HR',
  Serbia = 'RS',
  Bosnia = 'BA',
  Portugal = 'PT',
  France = 'FR',
  Germany = 'DE',
  Spain = 'ES',
}

/** Which renderer draws a city's map. The Google embed is being retired city by city. */
export enum MapRendererEnum {
  GoogleMyMaps = 'gmaps',
  MapLibre = 'maplibre',
}

/** Why a renderer gave up. `unsupported` is unrecoverable, so it must not offer a retry. */
export type MapFailureReason = 'unreachable' | 'unsupported';
