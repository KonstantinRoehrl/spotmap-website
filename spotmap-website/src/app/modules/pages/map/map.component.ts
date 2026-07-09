import { CommonModule, KeyValue } from '@angular/common';
import {
  Component,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import { CityEnum, CountryCodeEnum } from '../../../models/enums/map-enum';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';

@Component({
  selector: 'app-map',
  imports: [
    CommonModule,
    AsciiAnimationTextComponent,
    MapContainerComponent,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
  ],
  templateUrl: './map.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map.component.css',
})
export class MapComponent implements OnInit {
  protected selectedCity = signal<MapItem>(SUPPORTED_CITIES[CityEnum.Vienna]);

  // The key under which to store the last used city of the user
  protected localStorageKeyUserCity = 'userCity';

  protected citiesGroupedByCountry = signal<Map<CountryCodeEnum, MapItem[]>>(
    new Map<CountryCodeEnum, MapItem[]>(),
  );

  ngOnInit() {
    const userCity = this.readStoredCity();
    if (userCity && SUPPORTED_CITIES[userCity as CityEnum]) {
      this.selectedCity.set(SUPPORTED_CITIES[userCity as CityEnum]);
    }

    this.citiesGroupedByCountry.set(this.citiesByCountry());
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
