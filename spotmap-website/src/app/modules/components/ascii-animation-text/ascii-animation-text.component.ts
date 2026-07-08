import {
  AfterViewInit,
  Component,
  ElementRef,
  input,
  OnDestroy,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
  ChangeDetectionStrategy,
} from '@angular/core';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';

// Fixed font size used only for glyph measurement; the real size is derived by
// scaling this by containerWidth / measuredWidth. Any value works (advance is
// linear in font size); 100 keeps the arithmetic readable.
const MEASURE_REFERENCE_PX = 100;

@Component({
  selector: 'app-ascii-animation-text',
  standalone: true,
  templateUrl: './ascii-animation-text.component.html',
  styleUrls: ['./ascii-animation-text.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class AsciiAnimationTextComponent implements AfterViewInit, OnDestroy {
  messages = input<string[]>([
    'SYSTEM INITIALIZING...',
    'ACCESSING QUANTUM ENCRYPTION MODULE...',
    'LOADING TOP SECRET MAP DATA...',
    'DOWNLOADING SPOTS FROM F.B.I DATABASE...',
    'CALCULATING THEORETICAL TIME TRAVEL...',
    'ENCRYPTING YOUR THOUGHTS...',
    'ACCESS GRANTED',
    'WELCOME TO THE VIENNA SPOTMAP',
  ]);

  centered = input<boolean>(false);
  animationSpeed = input<number>(45);
  waitFrames = input<number>(20); // Frames to wait after full text is displayed
  glitchChance = input<number>(0.015);
  breakFrames = input<number>(5);
  loop = input<boolean>(false);

  animationFinished = output<void>();

  // Scoped to THIS component's view so measurement never picks up another
  // <app-ascii-animation-text> instance's container from the document.
  private readonly asciiContainer =
    viewChild.required<ElementRef<HTMLElement>>('asciiContainer');

  baseText = signal<string>(''); // main text
  dots = signal<string>(''); // animated dots
  fontSize = signal<number>(22); // default 22px

  // Lazily-created canvas 2d context reused for glyph measurement.
  // `undefined` = not created yet, `null` = created but no 2d context.
  private measureCtx?: CanvasRenderingContext2D | null;

  private currentIndex = 0;
  private charIndex = 0;
  private interval?: ReturnType<typeof setInterval>;
  private hasFinished = false;
  private destroyed = false;

  private glitchedPositions = new Set<number>();
  private glitchChars: string[] = [
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
  ];

  private collapseFrames = 10; // frames for collapse animation

  private resizeListener?: () => void;

  ngAfterViewInit(): void {
    this.updateFontSize();

    // The first measurement above can run against the fallback font before
    // IBM Plex Mono has loaded, giving a slightly wrong glyph advance / size.
    // Re-measure once web fonts are ready. Guarded for no-DOM / no-`fonts` envs.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!this.destroyed) this.updateFontSize();
      });
    }

    this.startAnimation();

    // Listen for window resize
    this.resizeListener = () => {
      this.updateFontSize();
    };
    window.addEventListener('resize', this.resizeListener);
  }

  ngOnDestroy() {
    this.destroyed = true;
    if (this.interval) {
      clearInterval(this.interval);
    }
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = undefined;
    }
  }

  private startAnimation() {
    if (this.hasFinished) return;

    // Reduced motion: skip the per-character typewriter/glitch loop entirely.
    // Render the final message (last line, fully typed, un-glitched) at once
    // and emit `animationFinished` a single time so the flow still proceeds.
    if (prefersReducedMotion()) {
      const messages = this.messages();
      const finalMessage = messages.length ? messages[messages.length - 1] : '';
      this.baseText.set(this.animateLoadingDots(finalMessage));
      this.hasFinished = true;
      this.animationFinished.emit();
      return;
    }

    this.interval = setInterval(() => {
      const currentMessage = this.messages()[this.currentIndex];

      // Typing phase
      if (this.charIndex < currentMessage.length) {
        const baseText = currentMessage.substring(0, this.charIndex + 1);
        this.baseText.set(this.applyEffects(baseText, true) + '_');
        this.charIndex++;
      }
      // Show complete message
      else if (this.charIndex === currentMessage.length) {
        const finalText = this.applyEffects(currentMessage, false);
        this.baseText.set(finalText);
        this.charIndex++;
      }
      // Wait with effects
      else if (this.charIndex < currentMessage.length + this.waitFrames()) {
        const finalText = this.applyEffects(currentMessage, false);
        this.baseText.set(finalText);
        this.charIndex++;
      }
      // Collapse animation
      else if (
        this.charIndex <
        currentMessage.length + this.waitFrames() + this.collapseFrames
      ) {
        const collapseStep =
          this.charIndex - currentMessage.length - this.waitFrames();
        this.baseText.set(this.collapseText(currentMessage, collapseStep));
        this.charIndex++;
      }
      // Short break (text fully cleared)
      else if (
        this.charIndex <
        currentMessage.length +
          this.waitFrames() +
          this.collapseFrames +
          this.breakFrames()
      ) {
        this.baseText.set(''); // keep screen empty
        this.charIndex++;
      }
      // Next message or finish
      else {
        this.charIndex = 0;
        this.glitchedPositions.clear();

        if (this.loop()) {
          let nextIndex: number;
          do {
            nextIndex = Math.floor(Math.random() * this.messages().length);
          } while (
            nextIndex === this.currentIndex &&
            this.messages().length > 1
          );
          this.currentIndex = nextIndex;
        } else {
          this.currentIndex++;
          if (this.currentIndex >= this.messages().length) {
            this.hasFinished = true;
            clearInterval(this.interval);
            this.animationFinished.emit();
            return;
          }
        }
      }
    }, this.animationSpeed());
  }

  // Collapse animation: randomly remove characters
  private collapseText(text: string, step: number): string {
    const chars = text.split('');
    const total = chars.length;
    const toRemove = Math.floor((step / this.collapseFrames) * total);

    for (let i = 0; i < toRemove; i++) {
      if (chars.length === 0) break;
      const pos = Math.floor(Math.random() * chars.length);
      chars.splice(pos, 1); // remove character completely
    }

    return this.applyEffects(chars.join(''), false);
  }

  private applyEffects(text: string, isTyping: boolean): string {
    let result = text;

    // Animate dots separately
    result = this.animateLoadingDots(result);

    const chance = isTyping ? this.glitchChance() / 2 : this.glitchChance();
    result = this.applyGlitchEffect(result, chance);

    return result;
  }

  private updateFontSize() {
    // Query THIS component's own container, not the first .ascii-container in
    // the document (there can be several instances on the page).
    const container = this.asciiContainer().nativeElement;
    const containerWidth = container.clientWidth;

    // Longest message drives the fit.
    const messages = this.messages();
    const maxLength = messages.length
      ? Math.max(...messages.map((msg) => msg.length))
      : 0;

    // Nothing to size against, or the element has not been laid out yet.
    if (maxLength === 0 || containerWidth === 0) return;

    // Width of the longest line rendered at a fixed reference size, using the
    // component's ACTUAL monospace face — so we account for IBM Plex Mono's
    // ~0.6x advance instead of assuming 1 glyph === fontSize px wide.
    const referenceLineWidth = this.measureLineWidth(container, maxLength);
    if (!referenceLineWidth) return; // no canvas / zero-width measurement

    // Scale so `maxLength` glyphs exactly fill the container.
    let newFontSize = Math.floor(
      (containerWidth / referenceLineWidth) * MEASURE_REFERENCE_PX,
    );

    // Clamp font size
    if (newFontSize > 40) newFontSize = 40;
    if (newFontSize < 12) newFontSize = 12;

    this.fontSize.set(newFontSize);
  }

  /**
   * Pixel width of `maxLength` monospace glyphs rendered at
   * MEASURE_REFERENCE_PX, measured via a canvas 2d context using the font
   * actually applied to the <pre>. Returns 0 when measurement is impossible
   * (no 2d context, or a zero-width result pre-layout).
   */
  private measureLineWidth(container: HTMLElement, maxLength: number): number {
    const ctx = this.getMeasureContext();
    if (!ctx) return 0;

    const pre = container.querySelector('.ascii-display') as HTMLElement | null;
    const fontFamily =
      (pre && getComputedStyle(pre).fontFamily) || "'IBM Plex Mono', monospace";

    ctx.font = `${MEASURE_REFERENCE_PX}px ${fontFamily}`;
    return ctx.measureText('0'.repeat(maxLength)).width;
  }

  /** Lazily create and cache a canvas 2d context for text measurement. */
  private getMeasureContext(): CanvasRenderingContext2D | null {
    if (this.measureCtx === undefined) {
      this.measureCtx = document.createElement('canvas').getContext('2d');
    }
    return this.measureCtx;
  }

  private animateLoadingDots(text: string): string {
    if (!text.includes('...')) {
      this.dots.set(''); // no dots for this line
      return text;
    }

    const dotCycle = Math.floor(Date.now() / 500) % 3;
    this.dots.set(['.', '..', '...'][dotCycle]);

    return text.replace(/\.{3}/g, ''); // strip "..." placeholder
  }

  private applyGlitchEffect(text: string, chance: number): string {
    if (Math.random() < 0.3) {
      this.glitchedPositions.clear();
    }

    const result = text.split('');

    for (let i = 0; i < result.length; i++) {
      if (result[i] !== ' ' && Math.random() < chance) {
        this.glitchedPositions.add(i);
      }
    }

    this.glitchedPositions.forEach((pos) => {
      if (pos < result.length && result[pos] !== ' ') {
        result[pos] =
          this.glitchChars[Math.floor(Math.random() * this.glitchChars.length)];
      }
    });

    return result.join('');
  }
}
