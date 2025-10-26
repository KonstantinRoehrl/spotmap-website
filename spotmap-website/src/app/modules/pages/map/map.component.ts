import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import { CityEnum, FlagEnum } from '../../../models/enums/map-enum';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';
import { GlitchTextDirective } from '../../directives/glitch-text.directive';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    CommonModule,
    AsciiAnimationTextComponent,
    MapContainerComponent,
    MatFormFieldModule,
    GlitchTextDirective,
    MatSelectModule,
    MatOptionModule],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent implements OnInit {
  MapEnum = CityEnum;   // expose enum
  CountryEnum = FlagEnum; // expose enum


  protected selectedCity = signal<MapItem>(SUPPORTED_CITIES[CityEnum.Vienna]);

  // The key under which to store the last used city of the user
  protected localStorageKeyUserCity = "userCity"

  protected citiesGroupedByCountry = signal<Map<FlagEnum, MapItem[]>>(new Map<FlagEnum, MapItem[]>());


  ngOnInit() {
    // Try get last used city of user
    const userCity = localStorage.getItem(this.localStorageKeyUserCity);
    if (userCity && SUPPORTED_CITIES[userCity as CityEnum]) {
      this.selectedCity.set(SUPPORTED_CITIES[userCity as CityEnum]);
    }

    const grouped = this.citiesByCountry();
    this.citiesGroupedByCountry.set(grouped);
  }

  protected citiesByCountry(): Map<FlagEnum, MapItem[]> {
    const grouped = new Map<FlagEnum, MapItem[]>();

    // Convert Record to array first
    const citiesArray = Object.values(SUPPORTED_CITIES);

    for (const city of citiesArray) {
      const flag = city.flag;

      if (!grouped.has(flag)) {
        grouped.set(flag, []);
      }
      grouped.get(flag)!.push(city);
    }

    // Sort cities alphabetically by city name
    for (const [, cities] of grouped) {
      cities.sort((a, b) => a.city.localeCompare(b.city));
    }

    // Sort groups alphabetically by country name
    const sortedEntries = Array.from(grouped.entries()).sort(
      ([, aCities], [, bCities]) =>
        aCities[0].country.localeCompare(bCities[0].country)
    );

    return new Map(sortedEntries);
  }

  selectCity(city: MapItem) {
    this.selectedCity.set(city);
    localStorage.setItem(this.localStorageKeyUserCity, city.city); // store the city key

  }


}
