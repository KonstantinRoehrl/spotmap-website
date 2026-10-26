import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';

import { AsciiAnimationTextComponent } from './ascii-animation-text.component';

describe('AsciiAnimationTextComponent', () => {
  let component: AsciiAnimationTextComponent;
  let fixture: ComponentFixture<AsciiAnimationTextComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsciiAnimationTextComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AsciiAnimationTextComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** What the browser paints for a token value of `property`. */
  function painted(property: 'text-shadow' | 'color', value: string): string {
    const probe = document.createElement('span');
    probe.style.setProperty(property, value);
    document.body.appendChild(probe);
    const result = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return result;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lights the banner in the Display tier', () => {
    const banner = fixture.nativeElement.querySelector('.ascii-display');
    expect(getComputedStyle(banner).textShadow).toBe(
      painted('text-shadow', 'var(--glow-text-display)'),
    );
    expect(getComputedStyle(banner).color).toBe(
      painted('color', 'var(--color-phosphor-bright)'),
    );
  });

  it('removes its window resize listener on destroy', () => {
    const added = new Map<string, EventListenerOrEventListenerObject>();
    spyOn(window, 'addEventListener').and.callFake(
      (type: string, cb: EventListenerOrEventListenerObject) =>
        added.set(type, cb),
    );
    const removeSpy = spyOn(window, 'removeEventListener').and.callThrough();

    const f = TestBed.createComponent(AsciiAnimationTextComponent);
    f.detectChanges(); // triggers ngAfterViewInit -> addEventListener('resize', ...)
    const handler = added.get('resize');
    expect(handler)
      .withContext('resize listener should be registered')
      .toBeDefined();

    f.destroy();

    expect(removeSpy).toHaveBeenCalledWith('resize', handler!);
  });

  it('types out the message provided via the signal input', fakeAsync(() => {
    const f = TestBed.createComponent(AsciiAnimationTextComponent);
    f.componentRef.setInput('messages', ['HELLO']);
    f.componentRef.setInput('glitchChance', 0); // deterministic: no character scrambling
    f.componentRef.setInput('animationSpeed', 10);
    f.detectChanges(); // ngAfterViewInit -> startAnimation

    expect(f.componentInstance.messages()).toEqual(['HELLO']);

    tick(10); // one frame -> first character typed with the trailing caret
    expect(f.componentInstance.baseText()).toBe('H_');

    f.destroy(); // clears the interval; no timers left for fakeAsync
  }));

  it('under reduced motion shows the final message instantly and emits once', () => {
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );

    const f = TestBed.createComponent(AsciiAnimationTextComponent);
    f.componentRef.setInput('messages', ['ALPHA', 'OMEGA']);
    const finished = jasmine.createSpy('animationFinished');
    f.componentInstance.animationFinished.subscribe(finished);

    f.detectChanges(); // ngAfterViewInit -> startAnimation (reduced-motion branch)

    // Final line rendered fully, no per-character interval scheduled.
    expect(f.componentInstance.baseText()).toBe('OMEGA');
    expect(finished).toHaveBeenCalledTimes(1);

    f.destroy(); // no timers were created, so nothing to leak
  });

  it('keeps the default font size and does not throw when there is nothing to measure', () => {
    const f = TestBed.createComponent(AsciiAnimationTextComponent);
    f.componentRef.setInput('messages', []); // maxLength === 0 -> guarded early-return

    expect(() => f.detectChanges()).not.toThrow();
    expect(f.componentInstance.fontSize()).toBe(22);

    f.destroy();
  });

  it('sets the line at a fixed size when given one, and never refits it', () => {
    const f = TestBed.createComponent(AsciiAnimationTextComponent);
    f.componentRef.setInput('messages', ['SPOTMAP']);
    f.componentRef.setInput('fixedFontSize', 14);
    f.detectChanges();
    const pre = f.nativeElement.querySelector('.ascii-display') as HTMLElement;
    expect(pre.style.fontSize).toBe('14px');

    window.dispatchEvent(new Event('resize'));
    f.detectChanges();
    expect(pre.style.fontSize).toBe('14px');

    f.destroy();
  });

  it('keeps its dot gutters by default and drops them when asked', () => {
    const gutters = (dotGutters: boolean | undefined) => {
      const f = TestBed.createComponent(AsciiAnimationTextComponent);
      if (dotGutters !== undefined) {
        f.componentRef.setInput('dotGutters', dotGutters);
      }
      f.detectChanges();
      const pre = f.nativeElement.querySelector('.ascii-display')!;
      const count = pre.querySelectorAll('.loading-dots').length;
      expect(pre.querySelectorAll('.ascii-line').length).toBe(1);
      f.destroy();
      return count;
    };
    expect(gutters(undefined)).toBe(2);
    expect(gutters(false)).toBe(0);
  });

  it('announces each line before its first character is typed', fakeAsync(() => {
    const f = TestBed.createComponent(AsciiAnimationTextComponent);
    f.componentRef.setInput('messages', ['AB', 'CD']);
    f.componentRef.setInput('glitchChance', 0);
    f.componentRef.setInput('animationSpeed', 10);
    f.componentRef.setInput('waitFrames', 1);
    f.componentRef.setInput('breakFrames', 1);
    const starts: string[] = [];
    f.componentInstance.lineStart.subscribe((line) => starts.push(line));
    f.detectChanges();
    expect(starts).toEqual([]);

    tick(10); // frame 1: `AB` starts, its first character typed in the same frame
    expect(starts).toEqual(['AB']);
    expect(f.componentInstance.baseText()).toBe('A_');

    // `AB` takes 15 frames (2 typed, 1 shown, 1 waited, 10 collapsing, 1 blank) and the next
    // message is picked on frame 15, so frame 16 announces and types `CD`.
    tick(10 * 15);
    expect(starts).toEqual(['AB', 'CD']);
    expect(f.componentInstance.baseText()).toBe('C_');

    f.destroy();
  }));

  it('under reduced motion announces the static line once, and nothing without lines', () => {
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    const announced = (messages: string[]) => {
      const f = TestBed.createComponent(AsciiAnimationTextComponent);
      f.componentRef.setInput('messages', messages);
      const starts: string[] = [];
      f.componentInstance.lineStart.subscribe((line) => starts.push(line));
      f.detectChanges();
      f.destroy();
      return starts;
    };
    expect(announced(['ALPHA', 'OMEGA'])).toEqual(['OMEGA']);
    expect(announced([])).toEqual([]);
  });
});
