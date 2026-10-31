import {
  DestroyRef,
  Directive,
  ElementRef,
  NgZone,
  inject,
  input,
} from '@angular/core';

/** The reduced-motion query, cached by each directive: `.matches` stays live as the setting changes. */
function reducedMotionQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
}

/**
 * Writes the pointer's position within `element` as `--x` / `--y` percentages, measuring only if
 * `box` is not known yet; under reduced motion it does neither, so the bloom stays centred.
 * Returns the box for the caller to cache.
 */
function centreBloom(
  element: HTMLElement,
  box: DOMRect | null,
  event: PointerEvent,
  reducedMotion: MediaQueryList | null,
): DOMRect | null {
  if (reducedMotion?.matches) return box;
  const measured = box ?? element.getBoundingClientRect();
  if (measured.width === 0 || measured.height === 0) return measured;
  const x = ((event.clientX - measured.left) / measured.width) * 100;
  const y = ((event.clientY - measured.top) / measured.height) * 100;
  element.style.setProperty('--x', `${x}%`);
  element.style.setProperty('--y', `${y}%`);
  return measured;
}

/**
 * Centres an element's pointer bloom on the pointer. The bloom itself is the `phosphor-bloom`
 * class in styles.css, which reads `--x` / `--y` and falls back to the element's centre; this
 * directive only writes those two properties.
 *
 * The element is measured once as the pointer enters it, never per move, so tracking costs no
 * layout. Its listeners run outside Angular's zone: they change no bound state, and a zone turn
 * per pointer move would run change detection for nothing. Under reduced motion the bloom stays
 * centred. It starts no timers and adds no classes; the press flash is plain CSS `:active`. For a
 * long list, {@link PointerBloomRowsDirective} does the same from the list itself.
 */
@Directive({ selector: '[appPointerBloom]' })
export class PointerBloomDirective {
  private readonly host: HTMLElement =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The element's box, cached from `pointerenter` until `pointerleave`. */
  private box: DOMRect | null = null;

  private readonly reducedMotion = reducedMotionQuery();

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

  private track(event: PointerEvent): void {
    this.box = centreBloom(this.host, this.box, event, this.reducedMotion);
  }
}

/**
 * {@link PointerBloomDirective} for a long list, on the list itself: one set of listeners instead of
 * a set per row. The row under the pointer is found with `closest` and measured once when the
 * pointer reaches it. The listeners run outside Angular's zone, for the same reason as the sibling's.
 */
@Directive({ selector: '[appPointerBloomRows]' })
export class PointerBloomRowsDirective {
  /** Selects a row among the host's descendants. */
  readonly rowSelector = input.required<string>({
    alias: 'appPointerBloomRows',
  });

  private readonly host: HTMLElement =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly reducedMotion = reducedMotionQuery();

  /** The row the pointer is on, and its box once measured. */
  private row: HTMLElement | null = null;
  private box: DOMRect | null = null;

  constructor() {
    const track = (event: Event) => this.track(event as PointerEvent);
    const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> =
      [
        ['pointerdown', track],
        ['pointermove', track],
        ['pointerout', (event) => this.leave(event as PointerEvent)],
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

  private rowOf(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element
      ? target.closest<HTMLElement>(this.rowSelector())
      : null;
  }

  private track(event: PointerEvent): void {
    const row = this.rowOf(event.target);
    if (row === null) return;
    if (row !== this.row) {
      this.row = row;
      this.box = null;
    }
    this.box = centreBloom(row, this.box, event, this.reducedMotion);
  }

  private leave(event: PointerEvent): void {
    if (this.rowOf(event.relatedTarget) !== this.row) {
      this.row = null;
      this.box = null;
    }
  }
}
