import { Component, computed, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum } from '../../../models/enums/map-enum';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';

@Component({
    selector: 'app-map-container',
    imports: [LoadingBarComponent],
    templateUrl: './map-container.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './map-container.component.css'
})
export class MapContainerComponent {
  city = input.required<CityEnum>();

  readonly safeUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(SUPPORTED_CITIES[this.city()].mapLink),
  );

  protected iframeLoaded = signal(false);

  constructor(private sanitizer: DomSanitizer) {}

  onIframeLoad() {
    setTimeout(() => this.iframeLoaded.set(true), 700);
  }
}
