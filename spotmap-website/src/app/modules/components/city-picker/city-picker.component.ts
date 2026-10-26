import { KeyValue, KeyValuePipe, UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import { CountryCodeEnum } from '../../../models/enums/map-enum';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';

/**
 * Every supported city grouped by country code. The groups are in country-name order and the
 * cities in each group are A–Z, which is the order the picker's optgroups and options show.
 */
export function citiesByCountry(): Map<CountryCodeEnum, MapItem[]> {
  const grouped = new Map<CountryCodeEnum, MapItem[]>();
  for (const city of Object.values(SUPPORTED_CITIES)) {
    const cities = grouped.get(city.countryCode) ?? [];
    cities.push(city);
    grouped.set(city.countryCode, cities);
  }
  for (const [, cities] of grouped) {
    cities.sort((a, b) => a.city.localeCompare(b.city));
  }
  return new Map(
    Array.from(grouped.entries()).sort(([, aCities], [, bCities]) =>
      aCities[0].country.localeCompare(bCities[0].country),
    ),
  );
}

/**
 * The city select: every supported city grouped by country, the current one shown as
 * `<city> · <country code>`. The field and every option carry the shared pointer bloom; Material's
 * panel and option look come from `theme.scss`. The picker only reports a choice through
 * `citySelected`. Remembering it is the caller's job (see `stored-city.ts`).
 */
@Component({
  selector: 'app-city-picker',
  imports: [
    KeyValuePipe,
    UpperCasePipe,
    MatFormFieldModule,
    MatSelectModule,
    PointerBloomDirective,
  ],
  templateUrl: './city-picker.component.html',
  styleUrl: './city-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityPickerComponent {
  /** The city shown as selected; one of the `SUPPORTED_CITIES` entries, matched by reference. */
  selected = input.required<MapItem>();

  /** The visitor picked a city from the panel. */
  citySelected = output<MapItem>();

  /** The picker's optgroups. The city list is fixed for the app's lifetime, so this is built once. */
  protected readonly groups = citiesByCountry();

  /**
   * Keeps the country optgroups in the country-name order `citiesByCountry()` built them in.
   * Without a comparator, KeyValuePipe re-sorts entries by the country-CODE key (AT, BA, CZ, DE,
   * ES, FR, …), which does not match the country-NAME labels shown on each optgroup.
   */
  protected readonly byCountryName = (
    a: KeyValue<CountryCodeEnum, MapItem[]>,
    b: KeyValue<CountryCodeEnum, MapItem[]>,
  ): number => a.value[0].country.localeCompare(b.value[0].country);
}
