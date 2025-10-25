import { Component, effect, input, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CityEnum } from '../../../models/enums/map-enum';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';

/** Holds the links for the corresponding maps */
export const MapLinks: Record<CityEnum, string> = {
  [CityEnum.Unknown]: "",
  // Austria
  [CityEnum.Vienna]: "https://www.google.com/maps/d/u/0/embed?mid=13c9hk1PqIRE5jgjTAr1pf4sP_9GNiIg&ehbc=2E312F&noprof=1",
  // Slovakia
  [CityEnum.Bratislava]: "https://www.google.com/maps/d/u/0/embed?mid=11v43r1GYNV0soxAefVXBRT1R-E_JAuI&ehbc=2E312F&noprof=1",
  // Czech
  [CityEnum.Prague]: "https://www.google.com/maps/d/u/0/embed?mid=1M3yJ3bz-KOrPTxIPHVUO6ZgMdtgFLqI&ehbc=2E312F&noprof=1",
  // Croatia
  [CityEnum.Zagreb]: "https://www.google.com/maps/d/u/0/embed?mid=1yVLyImhI2XOE7yg80PvGdwe-dDBfa5I&ehbc=2E312F&noprof=1",
  [CityEnum.Rijeka]: "https://www.google.com/maps/d/u/0/embed?mid=1EpSHyJXOp2H35Dn_HwdC0EzHfnHgojI&ehbc=2E312F&noprof=1",
  [CityEnum.Split]: "https://www.google.com/maps/d/u/0/embed?mid=1dgfVkXz-ruy1aoQePV7j2lhv5QzEfFw&ehbc=2E312F&noprof=1",
  // Serbia
  [CityEnum.Belgrad]: "https://www.google.com/maps/d/u/0/embed?mid=1YvzcNEJYFSuU9VYLUM3Nt3DW5Ro5PC8&ehbc=2E312F&noprof=1",
  // Bosnia
  [CityEnum.Sarajevo]: "https://www.google.com/maps/d/u/0/embed?mid=1bQasamQ0CRfALwtB5BzXZCRPSMugK4w&ehbc=2E312F&noprof=1",
  [CityEnum.Graz]: "https://www.google.com/maps/d/u/0/embed?mid=12VL0aop2XkUVOdyqh8GadV6RJM4Oztg&ehbc=2E312F&noprof=1",
  [CityEnum.Linz]: "https://www.google.com/maps/d/u/0/embed?mid=1J7UzUWB930mEv319KPFKDUNCuMqbgGM&ehbc=2E312F&noprof=1",
  [CityEnum.Salzburg]: "https://www.google.com/maps/d/u/0/embed?mid=1iCbIuQjvWH2ag86j2Jpz6HS7i8W3fi0&ehbc=2E312F&noprof=1"
}

@Component({
  selector: 'app-map-container',
  standalone: true,
  imports: [LoadingBarComponent],
  templateUrl: './map-container.component.html',
  styleUrl: './map-container.component.css'
})
export class MapContainerComponent implements OnInit {

  mapLink = input.required<CityEnum>();

  safeUrl?: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    // Reactively sanitize whenever mapLink changes
    effect(() => {
      const url = MapLinks[this.mapLink()];
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    });
  }

  protected iframeLoaded = signal(false);

  onIframeLoad() {
    setTimeout(() => {
      this.iframeLoaded.set(true);
    }, 700);
  }

  ngOnInit(): void {
  }

}
