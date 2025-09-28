import { Component, effect, input, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MapEnum } from '../../../models/enums/map-enum';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';

/** Holds the links for the corresponding maps */
export const MapLinks: Record<MapEnum, string> = {
  [MapEnum.Unknown]: "",
  [MapEnum.Vienna]: "https://www.google.com/maps/d/u/0/embed?mid=13c9hk1PqIRE5jgjTAr1pf4sP_9GNiIg&ehbc=2E312F&noprof=1",
  [MapEnum.Bratislava]: "",
  [MapEnum.Split]: "",
  [MapEnum.Prag]: ""
}

@Component({
  selector: 'app-map-container',
  standalone: true,
  imports: [LoadingBarComponent],
  templateUrl: './map-container.component.html',
  styleUrl: './map-container.component.css'
})
export class MapContainerComponent implements OnInit {

  mapLink = input.required<MapEnum>();

  safeUrl?: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    // Reactively sanitize whenever mapLink changes
    effect(() => {
      const url = MapLinks[this.mapLink()];
      console.log(url)
      console.log("safe", this.sanitizer.bypassSecurityTrustResourceUrl(url))
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    });
  }

  protected iframeLoaded = signal(false);

  onIframeLoad() {
    // Keep spinner for 500ms after iframe load
    setTimeout(() => {
      this.iframeLoaded.set(true);
    }, 700);
  }

  ngOnInit(): void {
    console.log(this.mapLink());
  }

}
