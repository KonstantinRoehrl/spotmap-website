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
