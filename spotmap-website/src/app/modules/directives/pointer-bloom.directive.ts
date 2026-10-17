import {
  DestroyRef,
  Directive,
  ElementRef,
  NgZone,
  inject,
} from '@angular/core';

/**
 * Centres an element's pointer bloom on the pointer. The bloom itself is the `phosphor-bloom`
 * class in styles.css, which reads `--x` / `--y` and falls back to the element's centre; this
 * directive only writes those two properties.
 *
 * The element is measured once as the pointer enters it, never per move, so tracking costs no
 * layout. Its listeners run outside Angular's zone: they change no bound state, and a zone turn
 * per pointer move would run change detection for nothing. Under reduced motion the bloom stays
 * centred. It starts no timers and adds no classes; the press flash is plain CSS `:active`.
 */
@Directive({ selector: '[appPointerBloom]' })
export class PointerBloomDirective {
  private readonly host: HTMLElement =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The element's box, cached from `pointerenter` until `pointerleave`. */
  private box: DOMRect | null = null;

  /** Cached once: `matchMedia()` allocates, and `.matches` stays live as the setting changes. */
  private readonly reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

  constructor() {
    const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> =
      [
        ['pointerenter', () => (this.box = this.host.getBoundingClientRect())],
        ['pointerleave', () => (this.box = null)],
        ['pointerdown', (event) => this.track(event as PointerEvent)],
        ['pointermove', (event) => this.track(event as PointerEvent)],
        // iOS Safari only applies :active — the press flash — where a touch listener exists.
        ['touchstart', () => undefined],
      ];
    inject(NgZone).runOutsideAngular(() => {
      for (const [type, listener] of listeners) {
        this.host.addEventListener(type, listener, { passive: true });
      }
    });
    inject(DestroyRef).onDestroy(() => {
      for (const [type, listener] of listeners) {
        this.host.removeEventListener(type, listener);
      }
    });
  }

  /** Writes the pointer's position within the element as `--x` / `--y` percentages. */
  private track(event: PointerEvent): void {
    if (this.reducedMotion?.matches) return;
    const box = (this.box ??= this.host.getBoundingClientRect());
    if (box.width === 0 || box.height === 0) return;
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    this.host.style.setProperty('--x', `${x}%`);
    this.host.style.setProperty('--y', `${y}%`);
  }
}
