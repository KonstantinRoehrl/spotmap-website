import { MapItem } from './interfaces/map-item-interface';
import { CityEnum, CountryEnum, CountryCodeEnum } from './map-enum';

export const SUPPORTED_CITIES: Record<CityEnum, MapItem> = {
  [CityEnum.Vienna]: {
    city: CityEnum.Vienna,
    country: CountryEnum.Austria,
    countryCode: CountryCodeEnum.Austria,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=13c9hk1PqIRE5jgjTAr1pf4sP_9GNiIg&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Graz]: {
    city: CityEnum.Graz,
    country: CountryEnum.Austria,
    countryCode: CountryCodeEnum.Austria,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=12VL0aop2XkUVOdyqh8GadV6RJM4Oztg&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Linz]: {
    city: CityEnum.Linz,
    country: CountryEnum.Austria,
    countryCode: CountryCodeEnum.Austria,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1J7UzUWB930mEv319KPFKDUNCuMqbgGM&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Salzburg]: {
    city: CityEnum.Salzburg,
    country: CountryEnum.Austria,
    countryCode: CountryCodeEnum.Austria,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1iCbIuQjvWH2ag86j2Jpz6HS7i8W3fi0&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Bratislava]: {
    city: CityEnum.Bratislava,
    country: CountryEnum.Slovakia,
    countryCode: CountryCodeEnum.Slovakia,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=11v43r1GYNV0soxAefVXBRT1R-E_JAuI&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Prague]: {
    city: CityEnum.Prague,
    country: CountryEnum.Czech,
    countryCode: CountryCodeEnum.Czech,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1M3yJ3bz-KOrPTxIPHVUO6ZgMdtgFLqI&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Zagreb]: {
    city: CityEnum.Zagreb,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1yVLyImhI2XOE7yg80PvGdwe-dDBfa5I&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Rijeka]: {
    city: CityEnum.Rijeka,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1EpSHyJXOp2H35Dn_HwdC0EzHfnHgojI&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Split]: {
    city: CityEnum.Split,
    country: CountryEnum.Croatia,
    countryCode: CountryCodeEnum.Croatia,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1dgfVkXz-ruy1aoQePV7j2lhv5QzEfFw&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Belgrad]: {
    city: CityEnum.Belgrad,
    country: CountryEnum.Serbia,
    countryCode: CountryCodeEnum.Serbia,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1YvzcNEJYFSuU9VYLUM3Nt3DW5Ro5PC8&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Sarajevo]: {
    city: CityEnum.Sarajevo,
    country: CountryEnum.Bosnia,
    countryCode: CountryCodeEnum.Bosnia,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1bQasamQ0CRfALwtB5BzXZCRPSMugK4w&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Lisbon]: {
    city: CityEnum.Lisbon,
    country: CountryEnum.Portugal,
    countryCode: CountryCodeEnum.Portugal,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1Yovquxft4XHZ9ZxQ0EEws6_6JbNzfeQ&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Paris]: {
    city: CityEnum.Paris,
    country: CountryEnum.France,
    countryCode: CountryCodeEnum.France,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1t9v4PkMwg0lTWlTq_920vNF0pBJNXag&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Munich]: {
    city: CityEnum.Munich,
    country: CountryEnum.Germany,
    countryCode: CountryCodeEnum.Germany,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=17-7uPZrlp0LG5MqKsKdmaJBAYk6BRXo&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Barcelona]: {
    city: CityEnum.Barcelona,
    country: CountryEnum.Spain,
    countryCode: CountryCodeEnum.Spain,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=16PXTegYiPPz7-ZusqQ6kyuucHZ3yNhQ&ehbc=2E312F&noprof=1',
  },
  [CityEnum.Valencia]: {
    city: CityEnum.Valencia,
    country: CountryEnum.Spain,
    countryCode: CountryCodeEnum.Spain,
    mapLink:
      'https://www.google.com/maps/d/u/0/embed?mid=1qvOlmPVyn0x11bbgaxDaxg0VqUGuAhc&ehbc=2E312F&noprof=1',
  },
};
