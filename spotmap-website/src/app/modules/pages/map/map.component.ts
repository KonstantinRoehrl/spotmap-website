import { Component } from '@angular/core';
import { MapEnum } from '../../../models/enums/map-enum';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import { MapContainerComponent } from '../../components/map-container/map-container.component';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [AsciiAnimationTextComponent, MapContainerComponent],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent {
  MapEnum = MapEnum;   // expose enum

}
