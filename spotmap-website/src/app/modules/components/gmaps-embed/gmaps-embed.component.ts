import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum, MapFailureReason } from '../../../models/enums/map-enum';

@Component({
  selector: 'app-gmaps-embed',
  imports: [],
  templateUrl: './gmaps-embed.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './gmaps-embed.component.css',
})
export class GmapsEmbedComponent {
  city = input.required<CityEnum>();

  /** Bumped by the container on RETRY; any change re-points the iframe at a fresh url. */
  retryToken = input.required<number>();

  ready = output<void>();
  failed = output<MapFailureReason>();

  readonly safeUrl = computed<SafeResourceUrl>(() => {
    const base = SUPPORTED_CITIES[this.city()].mapLink;
    const nonce = this.retryToken();
    // Preserve the exact original URL on first load; append a cache-buster only on retry.
    const url = nonce === 0 ? base : `${base}&_r=${nonce}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor(private sanitizer: DomSanitizer) {}

  protected onIframeLoad(): void {
    this.ready.emit();
  }

  protected onIframeError(): void {
    this.failed.emit('unreachable');
  }
}
