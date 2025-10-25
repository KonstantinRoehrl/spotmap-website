export enum CityEnum {
    Unknown = "",
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
    Sarajevo = 'sarajevo'
}

export enum FlagEnum {
    Austria = "🇦🇹",
    Slovakia = "🇸🇰",
    Czech = "🇨🇿",
    Croatia = "🇭🇷",
    Serbia = "🇷🇸",
    Bosnia = "🇧🇦",
}

export const CityToFlag: Record<CityEnum, FlagEnum | null> = {
    [CityEnum.Unknown]: null,
    [CityEnum.Vienna]: FlagEnum.Austria,
    [CityEnum.Graz]: FlagEnum.Austria,
    [CityEnum.Linz]: FlagEnum.Austria,
    [CityEnum.Salzburg]: FlagEnum.Austria,
    [CityEnum.Bratislava]: FlagEnum.Slovakia,
    [CityEnum.Prague]: FlagEnum.Czech,
    [CityEnum.Split]: FlagEnum.Croatia,
    [CityEnum.Zagreb]: FlagEnum.Croatia,
    [CityEnum.Rijeka]: FlagEnum.Croatia,
    [CityEnum.Belgrad]: FlagEnum.Serbia,
    [CityEnum.Sarajevo]: FlagEnum.Bosnia,
};

export const FlagToCountry:
    Record<FlagEnum, string> = {
    [FlagEnum.Austria]: "austria",
    [FlagEnum.Slovakia]: "slovakia",
    [FlagEnum.Czech]: "czech",
    [FlagEnum.Croatia]: "croatia",
    [FlagEnum.Serbia]: "serbia",
    [FlagEnum.Bosnia]: "bosnia",
};