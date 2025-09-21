// glitch-text.directive.ts
import { Directive, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: '[appGlitchText]',
  standalone: true
})
export class GlitchTextDirective {
  private originalText = '';
  private intervalId?: number;
  private glitchChars = ['#', '%', '&', '@', '*', '!', '?', '/', '\\', '|', '~', '$'];

  constructor(private el: ElementRef) {}

  @HostListener('mouseenter')
  onMouseEnter() {
    this.originalText = this.el.nativeElement.textContent;
    this.startGlitch();
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.stopGlitch();
    this.el.nativeElement.textContent = this.originalText;
  }

  private startGlitch() {
    console.log("Start glitch")
    this.intervalId = window.setInterval(() => {
      const chars = this.originalText.split('');
      const glitched = chars.map(c =>
        Math.random() < 0.15 && c !== ' '
          ? this.glitchChars[Math.floor(Math.random() * this.glitchChars.length)]
          : c
      );
      this.el.nativeElement.textContent = glitched.join('');
    }, 80);
  }

  private stopGlitch() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
