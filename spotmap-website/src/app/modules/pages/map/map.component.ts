import { KeyValue, KeyValuePipe, UpperCasePipe } from '@angular/common';
import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import { CityEnum, CountryCodeEnum } from '../../../models/enums/map-enum';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';

/**
 * The map page: an animated ASCII header, a city select grouped by country and the map for the
 * selected city. The choice is remembered in localStorage and restored on the next visit.
 */
@Component({
  selector: 'app-map',
  imports: [
    KeyValuePipe,
    UpperCasePipe,
    AsciiAnimationTextComponent,
    MapContainerComponent,
    MatFormFieldModule,
    MatSelectModule,
    PointerBloomDirective,
  ],
  templateUrl: './map.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map.component.css',
})
export class MapComponent {
  // The key under which to store the last used city of the user
  protected localStorageKeyUserCity = 'userCity';

  /** The city whose map is shown: the stored choice from the last visit, else Vienna. */
  protected selectedCity = signal<MapItem>(this.storedCityOrVienna());

  /** The picker's optgroups: every supported city, grouped by country and sorted by name. */
  protected citiesGroupedByCountry = signal<Map<CountryCodeEnum, MapItem[]>>(
    this.citiesByCountry(),
  );

  /**
   * The city remembered from the last visit, when localStorage holds one that is still a
   * supported city; Vienna otherwise (nothing stored, an unknown key, or storage unavailable).
   */
  private storedCityOrVienna(): MapItem {
    const userCity = this.readStoredCity();
    return (
      (userCity && SUPPORTED_CITIES[userCity as CityEnum]) ||
      SUPPORTED_CITIES[CityEnum.Vienna]
    );
  }

  private readStoredCity(): string | null {
    try {
      return localStorage.getItem(this.localStorageKeyUserCity);
    } catch {
      return null;
    }
  }

  private storeCity(cityKey: string): void {
    try {
      localStorage.setItem(this.localStorageKeyUserCity, cityKey);
    } catch {
      /* storage unavailable (private mode / blocked cookies) — non-fatal */
    }
  }

  protected citiesByCountry(): Map<CountryCodeEnum, MapItem[]> {
    const grouped = new Map<CountryCodeEnum, MapItem[]>();

    // Convert Record to array first
    const citiesArray = Object.values(SUPPORTED_CITIES);

    for (const city of citiesArray) {
      const countryCode = city.countryCode;

      if (!grouped.has(countryCode)) {
        grouped.set(countryCode, []);
      }
      grouped.get(countryCode)!.push(city);
    }

    // Sort cities alphabetically by city name
    for (const [, cities] of grouped) {
      cities.sort((a, b) => a.city.localeCompare(b.city));
    }

    // Sort groups alphabetically by country name
    const sortedEntries = Array.from(grouped.entries()).sort(
      ([, aCities], [, bCities]) =>
        aCities[0].country.localeCompare(bCities[0].country),
    );

    return new Map(sortedEntries);
  }

  /**
   * Keep the country optgroups in the country-name-alphabetical order
   * citiesByCountry() built them in. Without a comparator, KeyValuePipe re-sorts
   * entries by the country-CODE key (AT, BA, CZ, DE, ES, FR, …), which doesn't
   * match the country-NAME labels shown on each optgroup.
   */
  protected readonly byCountryName = (
    a: KeyValue<CountryCodeEnum, MapItem[]>,
    b: KeyValue<CountryCodeEnum, MapItem[]>,
  ): number => a.value[0].country.localeCompare(b.value[0].country);

  selectCity(city: MapItem) {
    this.selectedCity.set(city);
    this.storeCity(city.city);
  }
}
