import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { prefersReducedMotion } from '../../utils/prefers-reduced-motion';

/**
 * Scrambles a nav link's label like a glitching terminal: every 80 ms, each non-space character
 * of the host's `.nav-text` element has a 15 % chance of showing one of a dozen glyphs instead.
 *
 * Scrambling starts when the pointer enters the host, or when the host has or gains the `active`
 * class (`routerLinkActive`). It stops and the original text comes back when the pointer leaves a
 * host that is not active, or when the host loses `active` while not hovered. Under reduced motion
 * it never starts, so there is never anything to restore.
 *
 * The frame interval runs outside Angular's zone: a frame writes `innerText` directly and changes
 * no bound state, so a zone turn per frame would run change detection for nothing. The hover
 * listeners and the class observer stay in the zone.
 */
@Directive({
  selector: '[appGlitchText]',
  host: {
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onMouseLeave()',
  },
})
export class GlitchTextDirective implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  /** The label as it was when scrambling started; frames scramble it and restores write it back. */
  private originalText = '';
  /** The running frame interval, or undefined while not scrambling. */
  private intervalId?: number;
  /** The glyphs a scrambled character can show. */
  private glitchChars = [
    '#',
    '%',
    '&',
    '@',
    '*',
    '!',
    '?',
    '/',
    '\\',
    '|',
    '~',
    '$',
  ];
  /** The host's `.nav-text` element, found when scrambling starts. */
  private textNode?: HTMLElement;
  /** Watches the host's `class` attribute for `active` coming and going. */
  private observer?: MutationObserver;

  ngOnInit() {
    // If the element is active at init, start glitch
    this.checkActive();
  }

  ngOnDestroy() {
    this.stopGlitch();
    this.observer?.disconnect();
    this.observer = undefined;
  }

  /** Starts scrambling an already-active host and observes `active` from then on. */
  private checkActive() {
    const a = this.el.nativeElement;
    if (a.classList.contains('active')) {
      this.startGlitch();
    }

    // Use a MutationObserver to detect class changes dynamically
    this.observer = new MutationObserver(() => {
      if (a.classList.contains('active')) {
        this.startGlitch();
      } else if (!a.matches(':hover')) {
        this.stopGlitch();
        if (this.textNode) this.textNode.innerText = this.originalText;
      }
    });

    this.observer.observe(a, { attributes: true, attributeFilter: ['class'] });
  }

  /** Hovering any host starts scrambling. */
  protected onMouseEnter() {
    this.startGlitch();
  }

  /** Leaving a host that is not active stops scrambling and restores the label. */
  protected onMouseLeave() {
    const a = this.el.nativeElement;
    if (!a.classList.contains('active')) {
      this.stopGlitch();
      if (this.textNode) this.textNode.innerText = this.originalText;
    }
  }

  /**
   * Starts the frame interval unless it is running already, motion is reduced, or the host has no
   * `.nav-text`. The interval is created outside the zone whichever path calls this.
   */
  private startGlitch() {
    if (this.intervalId) return;

    // Reduced-motion: leave the final text intact, never scramble glyphs.
    // The MutationObserver / mouseleave restore paths are unaffected —
    // nothing was mutated, so there is nothing to restore.
    if (prefersReducedMotion()) return;

    this.textNode =
      this.el.nativeElement.querySelector<HTMLElement>('.nav-text') ??
      undefined;
    if (!this.textNode) return;

    this.originalText = this.textNode.innerText;

    this.intervalId = this.zone.runOutsideAngular(() =>
      window.setInterval(() => {
        if (!this.textNode) return;

        const chars = this.originalText.split('');
        const glitched = chars.map((c) =>
          Math.random() < 0.15 && c !== ' '
            ? this.glitchChars[
                Math.floor(Math.random() * this.glitchChars.length)
              ]
            : c,
        );

        this.textNode.innerText = glitched.join('');
      }, 80),
    );
  }

  /** Stops the frame interval; restoring the label is the caller's job. */
  private stopGlitch() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
