import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { CityPickerComponent } from '../../components/city-picker/city-picker.component';
import {
  readStoredCity,
  storeCity,
} from '../../components/city-picker/stored-city';
import { MapContainerComponent } from '../../components/map-container/map-container.component';

/**
 * The map page: an animated ASCII header, the city picker and the map for the selected city. The
 * choice is remembered in localStorage and restored on the next visit.
 */
@Component({
  selector: 'app-map',
  imports: [
    AsciiAnimationTextComponent,
    CityPickerComponent,
    MapContainerComponent,
  ],
  templateUrl: './map.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map.component.css',
})
export class MapComponent {
  /** The city whose map is shown: the stored choice from the last visit, else Vienna. */
  protected readonly selectedCity = signal<MapItem>(readStoredCity());

  /** Shows `city`'s map and remembers it for the next visit. */
  selectCity(city: MapItem): void {
    this.selectedCity.set(city);
    storeCity(city.city);
  }
}
