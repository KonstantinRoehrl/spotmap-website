import { Directive, ElementRef, HostListener, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appGlitchText]',
  standalone: true
})
export class GlitchTextDirective {
  private originalText = '';
  private intervalId?: number;
  private glitchChars = ['#', '%', '&', '@', '*', '!', '?', '/', '\\', '|', '~', '$'];
  private textNode?: HTMLElement;

  constructor(private el: ElementRef, private renderer: Renderer2) { }

  @HostListener('mouseenter')
  onMouseEnter() {
    // Target the .nav-text span instead of the full <a>
    this.textNode = this.el.nativeElement.querySelector('.nav-text');
    if (!this.textNode) return;

    this.originalText = this.textNode.innerText;
    this.startGlitch();
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.stopGlitch();
    if (this.textNode) {
      this.textNode.innerText = this.originalText;
    }
  }

  private startGlitch() {
    this.stopGlitch(); // ensure no duplicates

    this.intervalId = window.setInterval(() => {
      if (!this.textNode) return;

      const chars = this.originalText.split('');
      const glitched = chars.map(c =>
        Math.random() < 0.15 && c !== ' '
          ? this.glitchChars[Math.floor(Math.random() * this.glitchChars.length)]
          : c
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
