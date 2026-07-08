import {
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  Renderer2,
} from '@angular/core';
import { prefersReducedMotion } from '../../utils/prefers-reduced-motion';

@Directive({
  selector: '[appGlitchText]',
  standalone: true,
})
export class GlitchTextDirective implements OnInit, OnDestroy {
  private originalText = '';
  private intervalId?: number;
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
  private textNode?: HTMLElement;
  private observer?: MutationObserver;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
  ) {}

  ngOnInit() {
    // If the element is active at init, start glitch
    this.checkActive();
  }

  ngOnDestroy() {
    this.stopGlitch();
    this.observer?.disconnect();
    this.observer = undefined;
  }

  private checkActive() {
    const a = this.el.nativeElement as HTMLElement;
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

  @HostListener('mouseenter')
  onMouseEnter() {
    this.startGlitch();
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    const a = this.el.nativeElement as HTMLElement;
    if (!a.classList.contains('active')) {
      this.stopGlitch();
      if (this.textNode) this.textNode.innerText = this.originalText;
    }
  }

  private startGlitch() {
    if (this.intervalId) return;

    // Reduced-motion: leave the final text intact, never scramble glyphs.
    // The MutationObserver / mouseleave restore paths are unaffected —
    // nothing was mutated, so there is nothing to restore.
    if (prefersReducedMotion()) return;

    this.textNode = this.el.nativeElement.querySelector('.nav-text');
    if (!this.textNode) return;

    this.originalText = this.textNode.innerText;

    this.intervalId = window.setInterval(() => {
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
    }, 80);
  }

  private stopGlitch() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
