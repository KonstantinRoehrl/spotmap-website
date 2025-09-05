import {
  Component,
  signal,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewEncapsulation,
  Output,
  EventEmitter,
  input,
  Input
} from '@angular/core';

@Component({
  selector: 'app-ascii-animation-text',
  standalone: true,
  templateUrl: './ascii-animation-text.component.html',
  styleUrls: ['./ascii-animation-text.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AsciiAnimationTextComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() messages: string[] = [
    'SYSTEM INITIALIZING...',
    'ACCESSING QUANTUM ENCRYPTION MODULE...',
    'LOADING TOP SECRET MAP DATA...',
    'DOWNLOADING SPOTS FROM F.B.I DATABASE...',
    'CALCULATING THEORETICAL TIME TRAVEL...',
    'ENCRYPTING YOUR THOUGHTS...',
    'ACCESS GRANTED',
    'WELCOME TO THE VIENNA SPOTMAP'
  ];

  centered = input<boolean>(false);
  animationSpeed = input<number>(45);
  waitFrames = input<number>(20);   // Frames to wait after full text is displayed
  glitchChance = input<number>(0.015);
  breakFrames = input<number>(5);
  loop = input<boolean>(false);

  @Output() animationFinished = new EventEmitter<void>();

  baseText = signal<string>('');   // main text
  dots = signal<string>('');       // animated dots
  fontSize = signal<number>(22);   // default 22px

  private currentIndex = 0;
  private charIndex = 0;
  private interval?: ReturnType<typeof setInterval>;
  private hasFinished = false;

  private glitchedPositions = new Set<number>();
  private glitchChars: string[] = ['#', '%', '&', '@', '*', '!', '?', '/', '\\', '|', '~'];

  private collapseFrames = 10;   // frames for collapse animation

  ngOnInit() {}

  ngAfterViewInit(): void {
    this.updateFontSize();
    this.startAnimation();
  }

  ngOnDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private startAnimation() {
    if (this.hasFinished) return;

    this.interval = setInterval(() => {
      const currentMessage = this.messages[this.currentIndex];

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
      else if (this.charIndex < currentMessage.length + this.waitFrames() + this.collapseFrames) {
        const collapseStep = this.charIndex - currentMessage.length - this.waitFrames();
        this.baseText.set(this.collapseText(currentMessage, collapseStep));
        this.charIndex++;
      }
      // Short break (text fully cleared)
      else if (this.charIndex < currentMessage.length + this.waitFrames() + this.collapseFrames + this.breakFrames()) {
        this.baseText.set('');  // keep screen empty
        this.charIndex++;
      }
      // Next message or finish
      else {
        this.charIndex = 0;
        this.glitchedPositions.clear();

        if (this.loop()) {
          let nextIndex: number;
          do {
            nextIndex = Math.floor(Math.random() * this.messages.length);
          } while (nextIndex === this.currentIndex && this.messages.length > 1);
          this.currentIndex = nextIndex;
        } else {
          this.currentIndex++;
          if (this.currentIndex >= this.messages.length) {
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
    const container = document.querySelector('.ascii-container') as HTMLElement;
    if (!container) return;

    // Find the length of the longest message
    const maxLength = Math.max(...this.messages.map(msg => msg.length));
    const containerWidth = container.clientWidth;

    // Font size based on longest text
    let newFontSize = Math.floor(containerWidth / maxLength);

    // Clamp font size
    if (newFontSize > 40) newFontSize = 40;
    if (newFontSize < 12) newFontSize = 12;

    this.fontSize.set(newFontSize);
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

    this.glitchedPositions.forEach(pos => {
      if (pos < result.length && result[pos] !== ' ') {
        result[pos] = this.glitchChars[Math.floor(Math.random() * this.glitchChars.length)];
      }
    });

    return result.join('');
  }
}
