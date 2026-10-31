import { Component, NgZone, provideZoneChangeDetection } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  flush,
} from '@angular/core/testing';

import {
  PointerBloomDirective,
  PointerBloomRowsDirective,
} from './pointer-bloom.directive';

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

@Component({
  imports: [PointerBloomRowsDirective],
  template: `<ul appPointerBloomRows="a.spot-row">
    <li>
      <a class="spot-row" id="one" href="#"><span>ONE</span></a>
    </li>
    <li><a class="spot-row" id="two" href="#">TWO</a></li>
    <li id="gap">OFF ANY ROW</li>
  </ul>`,
})
class RowsHostComponent {}

describe('PointerBloomRowsDirective', () => {
  let fixture: ComponentFixture<RowsHostComponent>;
  let one: HTMLElement;
  let two: HTMLElement;
  let measureOne: jasmine.Spy;
  let measureTwo: jasmine.Spy;
  let listening: jasmine.Spy;

  function create(reducedMotion = false): void {
    TestBed.configureTestingModule({
      imports: [RowsHostComponent],
      providers: [provideZoneChangeDetection({ eventCoalescing: true })],
    });
    spyOn(window, 'matchMedia').and.returnValue({
      matches: reducedMotion,
    } as MediaQueryList);
    listening = spyOn(
      EventTarget.prototype,
      'addEventListener',
    ).and.callThrough();
    fixture = TestBed.createComponent(RowsHostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    one = element.querySelector('#one')!;
    two = element.querySelector('#two')!;
    measureOne = spyOn(one, 'getBoundingClientRect').and.returnValue(
      new DOMRect(100, 50, 200, 40),
    );
    measureTwo = spyOn(two, 'getBoundingClientRect').and.returnValue(
      new DOMRect(100, 90, 200, 40),
    );
  }

  function point(
    target: Element,
    type: string,
    x = 0,
    y = 0,
    related?: Element,
  ) {
    target.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        bubbles: true,
        relatedTarget: related ?? null,
      }),
    );
  }

  afterEach(() => fixture.destroy());

  it('centres the bloom on the row under the pointer, from a child of the row too', () => {
    create();
    point(one.querySelector('span')!, 'pointermove', 150, 60);
    expect(one.style.getPropertyValue('--x')).toBe('25%');
    expect(one.style.getPropertyValue('--y')).toBe('25%');
    expect(two.style.getPropertyValue('--x')).toBe('');
  });

  it('centres the press flash where the finger lands, without a move', () => {
    create();
    point(two, 'pointerdown', 300, 130);
    expect(two.style.getPropertyValue('--x')).toBe('100%');
    expect(two.style.getPropertyValue('--y')).toBe('100%');
  });

  it('measures a row once when the pointer reaches it, not per move', () => {
    create();
    for (let step = 0; step < 5; step++) {
      point(one, 'pointermove', 100 + step, 50);
    }
    expect(measureOne).toHaveBeenCalledTimes(1);
    point(two, 'pointermove', 100, 90);
    expect(measureTwo).toHaveBeenCalledTimes(1);
  });

  it('drops the cached box once the pointer leaves the row, not when it crosses a child', () => {
    create();
    point(one, 'pointermove', 100, 50);
    point(one, 'pointerout', 100, 50, one.querySelector('span')!);
    point(one, 'pointermove', 100, 50);
    expect(measureOne).toHaveBeenCalledTimes(1);
    point(one, 'pointerout', 100, 50, two);
    point(one, 'pointermove', 100, 50);
    expect(measureOne).toHaveBeenCalledTimes(2);
  });

  it('keeps the bloom centred under reduced motion, measuring nothing', () => {
    create(true);
    point(one, 'pointermove', 150, 60);
    point(one, 'pointerdown', 150, 60);
    expect(one.style.getPropertyValue('--x')).toBe('');
    expect(measureOne).not.toHaveBeenCalled();
  });

  it('ignores a pointer off any row', () => {
    create();
    point(fixture.nativeElement.querySelector('#gap'), 'pointermove', 1, 1);
    expect(measureOne).not.toHaveBeenCalled();
    expect(measureTwo).not.toHaveBeenCalled();
  });

  it('holds one passive listener set on the list and none on a row', () => {
    create();
    const list = fixture.nativeElement.querySelector('ul');
    const calls = listening.calls.all();
    expect(
      calls
        .filter((call) => call.object === list)
        .map((call) => call.args[0])
        .sort(),
    ).toEqual(['pointerdown', 'pointermove', 'pointerout', 'touchstart']);
    expect(
      calls.filter((call) => call.object === one || call.object === two),
    ).toEqual([]);
    for (const call of calls.filter((c) => c.object === list)) {
      expect(call.args[2]).toEqual({ passive: true });
    }
  });

  it('runs outside the Angular zone', async () => {
    create();
    let zoneTurns = 0;
    const subscription = TestBed.inject(NgZone).onMicrotaskEmpty.subscribe(
      () => zoneTurns++,
    );
    point(one, 'pointermove', 150, 60);
    // Event coalescing delays an in-zone turn until a frame or timeout, so wait past it.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(zoneTurns).toBe(0);
    subscription.unsubscribe();
  });

  it('removes its listeners on destroy', () => {
    create();
    const list = fixture.nativeElement.querySelector('ul');
    const removed = spyOn(list, 'removeEventListener').and.callThrough();
    fixture.destroy();
    expect(removed.calls.allArgs().map(([type]) => type)).toEqual(
      jasmine.arrayContaining([
        'pointerdown',
        'pointermove',
        'pointerout',
        'touchstart',
      ]),
    );
  });
});
