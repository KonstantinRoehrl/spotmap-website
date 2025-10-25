import { Component, signal } from '@angular/core';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { CityEnum, CityToFlag, FlagEnum, FlagToCountry } from '../../../models/enums/map-enum';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [AsciiAnimationTextComponent, MapContainerComponent,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent {
  MapEnum = CityEnum;   // expose enum
  CityToFlag = CityToFlag;
  FlagToCountry = FlagToCountry;
  CountryEnum = FlagEnum; // expose enum

  protected cityOptions = [CityEnum.Vienna, CityEnum.Split, CityEnum.Zagreb, CityEnum.Prague, CityEnum.Bratislava, CityEnum.Rijeka, CityEnum.Sarajevo, CityEnum.Belgrad, CityEnum.Graz, CityEnum.Linz, CityEnum.Salzburg];
  protected selectedCity = signal<CityEnum>(CityEnum.Vienna);

  // Group cities by country
  protected get citiesByCountry(): Map<FlagEnum, CityEnum[]> {
    const grouped = new Map<FlagEnum, CityEnum[]>();

    for (const city of this.cityOptions) {
      const country = CityToFlag[city];
      if (country) {
        if (!grouped.has(country)) {
          grouped.set(country, []);
        }
        grouped.get(country)!.push(city);
      }
    }

    return grouped;
  }

  // Get array of countries for iteration
  protected get countriesWithCities(): FlagEnum[] {
    return Array.from(this.citiesByCountry.keys());
  }

  selectCity(city: CityEnum) {
    this.selectedCity.set(city);
  }


}
