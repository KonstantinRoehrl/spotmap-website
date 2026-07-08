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

  it('should create', () => {
    expect(component).toBeTruthy();
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
});
