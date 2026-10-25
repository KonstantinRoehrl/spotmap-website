import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { PlatformLocation } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import { SpotPhotoGalleryComponent } from '../spot-photo-gallery/spot-photo-gallery.component';
import type { PhotoViewerRequest } from './spot-photo-viewer';

/** How long the photo takes to grow out of its rail photo, or to shrink back into it, in ms. */
export const VIEWER_GROW_MS = 420;

/**
 * The viewer's fades, in ms: `--dur-fade`, mirrored here because the Web Animations API and the
 * controls' wait cannot read a custom property.
 */
export const VIEWER_FADE_MS = 200;

/** The CDK backdrop's class: the 82 % black scrim, styled globally in `styles.css`. */
export const VIEWER_BACKDROP_CLASS = 'spot-photo-viewer-backdrop';

/** The CDK overlay pane's class, styled globally in `styles.css`. */
export const VIEWER_PANE_CLASS = 'spot-photo-viewer-pane';

/** The key the viewer's own history entry carries in its state, beside the app's own keys. */
export const VIEWER_HISTORY_MARKER = 'spotPhotoViewer';

/** `--ease-out-expo`'s value, used if the token cannot be read. */
const EASE_OUT_EXPO_FALLBACK = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** What closed the viewer: Back pops its entry itself, every other way must consume it. */
type CloseTrigger = 'button' | 'escape' | 'scrim' | 'back';

/** Whether a history state is the viewer's own entry. */
function isViewerEntry(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[VIEWER_HISTORY_MARKER] === true
  );
}

/** Resolves once `animation` has run out, whether it finished or was cancelled. */
function settled(animation: Animation): Promise<void> {
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Whether the middle of `element` is on screen: inside the viewport and inside every box that clips
 * it (the rail scrolls sideways, so a photo scrolled out of it is off screen though inside the
 * viewport).
 */
export function isOnScreen(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const view = element.ownerDocument.defaultView;
  if (!view || x < 0 || y < 0 || x > view.innerWidth || y > view.innerHeight) {
    return false;
  }
  for (let box = element.parentElement; box; box = box.parentElement) {
    const style = view.getComputedStyle(box);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') {
      continue;
    }
    const clip = box.getBoundingClientRect();
    if (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom) {
      return false;
    }
  }
  return true;
}

/**
 * A spot's photos over the whole app (spec W3): a window holding a title row with the spot's
 * name and an `[n/N]` counter, the photo as large as fits (the gallery, its full-size photo
 * crossfading in over the thumb), ✕ on the photo, a strip of thumbnails with the current one in
 * amber, and the rights line. ‹ ›, ← / →, a swipe or a thumbnail move through the photos, wrapping
 * at the ends. ✕, Esc, a click on the scrim or the browser's Back close it.
 *
 * Opening grows the photo out of the rail photo it was opened from while the scrim fades in; only
 * once it has landed do the window, the title row, the plates and the strip fade in, lightly
 * staggered. Closing runs it backwards, shrinking the photo into the current photo's rail photo, or
 * fading it where that photo is off screen. Under reduced motion nothing grows or shrinks and
 * everything fades.
 *
 * Opened only through {@link SpotPhotoViewer}, which supplies the request as `DIALOG_DATA`. The CDK
 * dialog traps focus and returns it to the opener. Back is one history entry pushed through
 * `PlatformLocation` with the page's own URL and state, so it closes the viewer and leaves the spot
 * open; every other close consumes that entry, so the spot's own close never lands on it.
 */
@Component({
  selector: 'app-spot-photo-viewer',
  imports: [PointerBloomDirective, SpotPhotoGalleryComponent],
  templateUrl: './spot-photo-viewer.component.html',
  styleUrl: './spot-photo-viewer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.viewer--controls]': 'controlsShown()' },
})
export class SpotPhotoViewerComponent {
  /** What to show and where it grows from. */
  protected readonly data = inject<PhotoViewerRequest>(DIALOG_DATA);
  /** The dialog this component fills. */
  private readonly dialogRef =
    inject<DialogRef<void, SpotPhotoViewerComponent>>(DialogRef);
  /** The browser's history, through Angular, for the viewer's Back entry. */
  private readonly platformLocation = inject(PlatformLocation);
  /** The component's own element, which reads the motion tokens. */
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** How many photos there are. */
  protected readonly count = this.data.thumbs.length;
  /** The photo on screen; the gallery binds it two-way. */
  protected readonly index = signal(this.data.index);
  /** The title row's `[n/N]`. */
  protected readonly counter = computed(
    () => `[${this.index() + 1}/${this.count}]`,
  );
  /** Whether the window, title row, plates and strip show: only while the photo is landed. */
  protected readonly controlsShown = signal(false);
  /** What the polite live region reads: the new place after a step, nothing on opening. */
  protected readonly announcement = signal('');

  /** The photo's box, which grows and shrinks. */
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  /** The strip, absent for a single photo. */
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  /** Where the viewer is in its life: growing in, open, or on its way out. */
  private phase: 'opening' | 'open' | 'closing' = 'opening';
  /** Set once the dialog has been told to close, so nothing closes it twice. */
  private closed = false;
  /** The wait for the controls' fade on closing, if one is running. */
  private fadeTimer?: ReturnType<typeof setTimeout>;
  /** Stops listening for Back. */
  private readonly stopListeningForBack: VoidFunction;

  constructor() {
    const state = this.platformLocation.getState();
    this.platformLocation.pushState(
      {
        ...(typeof state === 'object' && state !== null ? state : {}),
        [VIEWER_HISTORY_MARKER]: true,
      },
      '',
      this.platformLocation.href,
    );
    this.stopListeningForBack = this.platformLocation.onPopState(() => {
      if (!isViewerEntry(this.platformLocation.getState())) {
        void this.close('back');
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.stopListeningForBack();
      clearTimeout(this.fadeTimer);
      // Closed some other way (the dialog service torn down): the entry must not outlive it.
      if (!this.closed) {
        this.closed = true;
        this.releaseEntry();
      }
    });

    this.dialogRef.keydownEvents
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.onKeydown(event));
    this.dialogRef.backdropClick
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.close('scrim'));

    // A step is announced; the opening is not: the dialog's name already says where the visitor is.
    let opening = true;
    effect(() => {
      const index = this.index();
      untracked(() => {
        if (opening) {
          opening = false;
          return;
        }
        this.announcement.set(`Photo ${index + 1} of ${this.count}`);
      });
    });

    // The current thumbnail scrolls into the strip's view as the photo changes, horizontally only.
    afterRenderEffect(() => {
      const index = this.index();
      const strip = this.strip()?.nativeElement;
      const current = strip?.children.item(index) as HTMLElement | null;
      if (!strip || !current) {
        return;
      }
      const offsetInStrip =
        current.getBoundingClientRect().left -
        strip.getBoundingClientRect().left +
        strip.scrollLeft;
      strip.scrollTo({
        left: offsetInStrip - (strip.clientWidth - current.offsetWidth) / 2,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    });

    afterNextRender(() => void this.enter());
  }

  /**
   * Closes at once, without motion, consuming the history entry: for an opener that goes away.
   * Idempotent: once the viewer has closed by any path it does nothing, so a stale handle never
   * goes back over an entry that is not the viewer's.
   */
  closeNow(): void {
    if (this.closed) {
      return;
    }
    this.phase = 'closing';
    this.finish(true);
  }

  /**
   * Closes the viewer as the visitor asked: the controls fade out, then the photo shrinks into the
   * current photo's rail photo (or fades) while the scrim fades, then the dialog closes. A close
   * already under way swallows the request.
   */
  protected async close(trigger: CloseTrigger): Promise<void> {
    if (this.phase === 'closing') {
      return;
    }
    this.phase = 'closing';
    this.controlsShown.set(false);
    await this.wait(VIEWER_FADE_MS);
    const stage = this.stage().nativeElement;
    const origin = this.data.originOf(this.index());
    const shrink =
      origin && !prefersReducedMotion() && isOnScreen(origin)
        ? this.transformOnto(origin, stage)
        : null;
    const duration = shrink ? VIEWER_GROW_MS : VIEWER_FADE_MS;
    const scrim = this.dialogRef.overlayRef.backdropElement;
    await Promise.all([
      settled(
        shrink
          ? stage.animate([{ transform: 'none' }, { transform: shrink }], {
              duration,
              easing: this.easeOutExpo(),
              fill: 'forwards',
            })
          : stage.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration,
              easing: 'ease-out',
              fill: 'forwards',
            }),
      ),
      scrim
        ? settled(
            scrim.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration,
              easing: 'ease-out',
              fill: 'forwards',
            }),
          )
        : Promise.resolve(),
    ]);
    this.finish(trigger !== 'back');
  }

  /** Steps `delta` photos on, wrapping at the ends. */
  protected step(delta: number): void {
    this.index.update((index) => (index + delta + this.count) % this.count);
  }

  /**
   * Grows the photo out of the rail photo it was opened from, or fades it in where there is none
   * on screen or motion is reduced, and shows the controls once it has landed.
   */
  private async enter(): Promise<void> {
    const stage = this.stage().nativeElement;
    const origin = this.data.originOf(this.data.index);
    const grow =
      origin && !prefersReducedMotion() && isOnScreen(origin)
        ? this.transformOnto(origin, stage)
        : null;
    await settled(
      grow
        ? stage.animate([{ transform: grow }, { transform: 'none' }], {
            duration: VIEWER_GROW_MS,
            easing: this.easeOutExpo(),
          })
        : stage.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: VIEWER_FADE_MS,
            easing: 'ease-out',
          }),
    );
    if (this.phase === 'opening') {
      this.phase = 'open';
      this.controlsShown.set(true);
    }
  }

  /** Esc closes, ← and → step; nothing while the viewer is closing. */
  private onKeydown(event: KeyboardEvent): void {
    if (this.phase === 'closing') {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      void this.close('escape');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.step(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.step(-1);
    }
  }

  /**
   * The transform that lays `stage` (transform origin top left) over `target`, or `null` when the
   * stage has no size to scale from yet.
   */
  private transformOnto(
    target: HTMLElement,
    stage: HTMLElement,
  ): string | null {
    const from = target.getBoundingClientRect();
    const to = stage.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) {
      return null;
    }
    return (
      `translate(${from.left - to.left}px, ${from.top - to.top}px) ` +
      `scale(${from.width / to.width}, ${from.height / to.height})`
    );
  }

  /** `--ease-out-expo`, read from the stylesheet. */
  private easeOutExpo(): string {
    return (
      getComputedStyle(this.host).getPropertyValue('--ease-out-expo').trim() ||
      EASE_OUT_EXPO_FALLBACK
    );
  }

  /** Waits `ms`, the way the controls' CSS fade does. */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.fadeTimer = setTimeout(resolve, ms);
    });
  }

  /** Closes the dialog once, consuming the history entry unless Back already popped it. */
  private finish(consumeEntry: boolean): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopListeningForBack();
    if (consumeEntry) {
      this.releaseEntry();
    }
    this.dialogRef.close();
  }

  /** Goes back over the viewer's entry, if it is still the current one. */
  private releaseEntry(): void {
    if (isViewerEntry(this.platformLocation.getState())) {
      this.platformLocation.back();
    }
  }
}
