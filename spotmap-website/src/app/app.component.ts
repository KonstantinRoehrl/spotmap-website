import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MapContainerComponent } from './modules/map-container/map-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MapContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'spotmap-website';

  protected mapsLink = "https://www.google.com/maps/d/u/0/embed?mid=13c9hk1PqIRE5jgjTAr1pf4sP_9GNiIg&ehbc=2E312F";
}
