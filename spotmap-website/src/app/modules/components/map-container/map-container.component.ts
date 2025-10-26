import { Component, effect, input, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum } from '../../../models/enums/map-enum';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';


@Component({
  selector: 'app-map-container',
  standalone: true,
  imports: [LoadingBarComponent],
  templateUrl: './map-container.component.html',
  styleUrl: './map-container.component.css'
})
export class MapContainerComponent implements OnInit {

  city = input.required<CityEnum>();

  safeUrl?: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    // Reactively sanitize whenever mapLink changes
    effect(() => {
      const url = SUPPORTED_CITIES[this.city()].mapLink;
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
