import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';

/** Minimum horizontal travel that counts as a swipe rather than a tap, in CSS pixels. */
const SWIPE_THRESHOLD_PX = 40;

@Component({
  selector: 'app-spot-photo-gallery',
  imports: [],
  templateUrl: './spot-photo-gallery.component.html',
  styleUrl: './spot-photo-gallery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPhotoGalleryComponent {
  photos = input.required<string[]>();
  spotName = input.required<string>();

  protected readonly index = signal(0);
  protected readonly count = computed(() => this.photos().length);
  protected readonly current = computed(() => this.photos()[this.index()]);
  protected readonly hasMany = computed(() => this.count() > 1);
  protected readonly counter = computed(
    () => `[${this.index() + 1}/${this.count()}]`,
  );
  protected readonly altText = computed(
    () => `${this.spotName()}, photo ${this.index() + 1} of ${this.count()}`,
  );

  private touchStartX: number | null = null;

  next(): void {
    this.index.update((i) => (i + 1) % this.count());
  }

  previous(): void {
    this.index.update((i) => (i - 1 + this.count()) % this.count());
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null || !this.hasMany()) {
      return;
    }
    const delta =
      (event.changedTouches[0]?.clientX ?? this.touchStartX) - this.touchStartX;
    this.touchStartX = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) {
      return;
    }
    delta < 0 ? this.next() : this.previous();
  }
}
