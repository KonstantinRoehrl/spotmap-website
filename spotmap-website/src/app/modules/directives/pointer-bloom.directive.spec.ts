import { Component } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  flush,
} from '@angular/core/testing';

import { PointerBloomDirective } from './pointer-bloom.directive';

@Component({
  imports: [PointerBloomDirective],
  template: '<button class="phosphor-bloom" appPointerBloom>RETRY</button>',
})
class HostComponent {}

describe('PointerBloomDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let button: HTMLButtonElement;
  let measure: jasmine.Spy;

  /** Builds the host with the OS reduced-motion preference set as given. */
  function create(reducedMotion = false): void {
    spyOn(window, 'matchMedia').and.returnValue({
      matches: reducedMotion,
    } as MediaQueryList);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
    measure = spyOn(button, 'getBoundingClientRect').and.returnValue(
      new DOMRect(100, 50, 200, 40),
    );
  }

  /** Fires a pointer event of `type` at viewport point (x, y) on the button. */
  function point(type: string, x = 0, y = 0): void {
    button.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }),
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
  });

  it('centres the bloom on the pointer as it moves', () => {
    create();
    point('pointerenter', 100, 50);
    point('pointermove', 150, 60);
    expect(button.style.getPropertyValue('--x')).toBe('25%');
    expect(button.style.getPropertyValue('--y')).toBe('25%');
  });

  it('centres the press flash where the finger lands, without a move', () => {
    create();
    point('pointerenter', 300, 90);
    point('pointerdown', 300, 90);
    expect(button.style.getPropertyValue('--x')).toBe('100%');
    expect(button.style.getPropertyValue('--y')).toBe('100%');
  });

  it('measures the element once per entry, not per move', () => {
    create();
    point('pointerenter', 100, 50);
    for (let step = 0; step < 5; step++) {
      point('pointermove', 100 + step, 50);
    }
    expect(measure).toHaveBeenCalledTimes(1);
    point('pointerleave');
    point('pointerenter', 100, 50);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('leaves no timer behind', fakeAsync(() => {
    create();
    point('pointerenter', 100, 50);
    point('pointerdown', 120, 60);
    button.dispatchEvent(new Event('touchstart'));
    point('pointerup', 120, 60);
    point('pointerleave');
    // flush() reports the virtual time it advanced: 0 means no timer was queued.
    expect(flush()).toBe(0);
  }));

  it('keeps the bloom centred under reduced motion', () => {
    create(true);
    point('pointerenter', 100, 50);
    point('pointermove', 150, 60);
    point('pointerdown', 150, 60);
    expect(button.style.getPropertyValue('--x')).toBe('');
    expect(button.style.getPropertyValue('--y')).toBe('');
  });

  it('removes its listeners on destroy', () => {
    create();
    const removed = spyOn(button, 'removeEventListener').and.callThrough();
    fixture.destroy();
    const types = removed.calls.allArgs().map(([type]) => type);
    expect(types).toEqual(
      jasmine.arrayContaining([
        'pointerenter',
        'pointerleave',
        'pointerdown',
        'pointermove',
        'touchstart',
      ]),
    );
  });
});
