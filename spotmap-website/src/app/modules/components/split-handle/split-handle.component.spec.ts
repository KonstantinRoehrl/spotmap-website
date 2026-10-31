import {
  Component,
  NgZone,
  provideZoneChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SplitHandleComponent } from './split-handle.component';

/** A 1000 px frame's height, with the handle in a row the way the map page lays it out. */
@Component({
  imports: [SplitHandleComponent],
  template: `
    <div style="display: flex; height: 400px; width: 1000px">
      <app-split-handle
        [columnWidth]="width()"
        [frameWidth]="1000"
        (widthChange)="widths.push($event)"
        (widthReset)="resets = resets + 1"
        (widthCommit)="commits = commits + 1"
      />
    </div>
  `,
})
class HostComponent {
  readonly width = signal(384);
  readonly widths: number[] = [];
  resets = 0;
  commits = 0;
}

describe('SplitHandleComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let handle: HTMLElement;

  /** What the browser paints for a token, so assertions compare rendered values. */
  function painted(property: string, token: string): string {
    const probe = document.createElement('span');
    probe.style.setProperty(property, token);
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return value;
  }

  /** Presses `key` on the handle and says whether the handle took it (prevented the default). */
  function press(key: string, shiftKey = false): boolean {
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(event);
    fixture.detectChanges();
    return event.defaultPrevented;
  }

  /** One pointer event on the handle; synthetic pointers cannot really be captured, see beforeEach. */
  function pointer(
    type: string,
    clientX: number,
    init: PointerEventInit = {},
  ): void {
    handle.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        button: 0,
        clientX,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    fixture.detectChanges();
  }

  /**
   * Starts a native drag on an element outside the handle and says whether it was cancelled. The
   * element stops the event's propagation, so only a capture-phase listener can reach it.
   */
  function nativeDragCancelled(): boolean {
    const link = document.createElement('a');
    link.addEventListener('dragstart', (event) => event.stopPropagation());
    document.body.appendChild(link);
    const event = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);
    link.remove();
    return event.defaultPrevented;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    handle = (fixture.nativeElement as HTMLElement).querySelector(
      'app-split-handle',
    ) as HTMLElement;
    // Chrome throws NotFoundError when a synthetic event's pointer id is captured: no real pointer
    // is down. The capture calls are faked so the drag logic around them can be driven.
    const captured = new Set<number>();
    spyOn(handle, 'setPointerCapture').and.callFake((id: number) =>
      captured.add(id),
    );
    spyOn(handle, 'hasPointerCapture').and.callFake((id: number) =>
      captured.has(id),
    );
    spyOn(handle, 'releasePointerCapture').and.callFake((id: number) =>
      captured.delete(id),
    );
  });

  afterEach(() => fixture.destroy());

  describe('as a window splitter', () => {
    it('is a focusable vertical separator named for what it resizes', () => {
      expect(handle.getAttribute('role')).toBe('separator');
      expect(handle.tabIndex).toBe(0);
      expect(handle.getAttribute('aria-orientation')).toBe('vertical');
      expect(handle.getAttribute('aria-label')).toBe(
        'Resize map and spot column',
      );
    });

    it('reports the column’s share of the frame in whole percent, between its limits', () => {
      expect(handle.getAttribute('aria-valuenow')).toBe('38');
      expect(handle.getAttribute('aria-valuemin')).toBe('34');
      expect(handle.getAttribute('aria-valuemax')).toBe('50');
      expect(handle.getAttribute('aria-valuetext')).toBe(
        'Spot column 38 percent',
      );

      fixture.componentInstance.width.set(500);
      fixture.detectChanges();
      expect(handle.getAttribute('aria-valuenow')).toBe('50');
      expect(handle.getAttribute('aria-valuetext')).toBe(
        'Spot column 50 percent',
      );
    });
  });

  describe('from the keyboard', () => {
    it('widens the column with ← and narrows it with →, 16 px a step', () => {
      expect(press('ArrowLeft')).toBeTrue();
      expect(press('ArrowRight')).toBeTrue();
      expect(fixture.componentInstance.widths).toEqual([400, 368]);
    });

    it('takes 64 px steps with Shift, clamped at the limits', () => {
      press('ArrowLeft', true);
      press('ArrowRight', true);
      expect(fixture.componentInstance.widths).toEqual([448, 340]);
    });

    it('goes to the column’s minimum with Home and its maximum with End', () => {
      press('Home');
      press('End');
      expect(fixture.componentInstance.widths).toEqual([340, 500]);
    });

    it('reports nothing for a step past a limit', () => {
      fixture.componentInstance.width.set(500);
      fixture.detectChanges();
      press('ArrowLeft');
      press('End');
      expect(fixture.componentInstance.widths).toEqual([]);
    });

    it('commits after a key step that changed the width, and not after one that did not', () => {
      press('ArrowLeft');
      expect(fixture.componentInstance.commits).toBe(1);
      press('Tab');
      fixture.componentInstance.width.set(500);
      fixture.detectChanges();
      press('End');
      expect(fixture.componentInstance.commits).toBe(1);
    });

    it('leaves every other key to the page', () => {
      expect(press('Tab')).toBeFalse();
      expect(press('Enter')).toBeFalse();
      expect(fixture.componentInstance.widths).toEqual([]);
    });
  });

  describe('by pointer', () => {
    it('follows a drag: the column gains what the pointer moves left, clamped, on every move', () => {
      pointer('pointerdown', 600);
      expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
      pointer('pointermove', 560);
      pointer('pointermove', 640);
      pointer('pointermove', 900);
      pointer('pointermove', 300);
      expect(fixture.componentInstance.widths).toEqual([424, 344, 340, 500]);
    });

    it('measures the drag from the width it started at', () => {
      fixture.componentInstance.width.set(420);
      fixture.detectChanges();
      pointer('pointerdown', 600);
      // The page feeds the new width back; the drag must not compound it.
      fixture.componentInstance.width.set(436);
      fixture.detectChanges();
      pointer('pointermove', 580);
      expect(fixture.componentInstance.widths).toEqual([440]);
    });

    it('lets go on pointerup and on pointercancel, releasing the capture', () => {
      for (const end of ['pointerup', 'pointercancel']) {
        fixture.componentInstance.widths.length = 0;
        pointer('pointerdown', 600);
        expect(handle.classList).withContext(end).toContain('is-dragging');
        pointer(end, 600);
        expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
        expect(handle.classList).withContext(end).not.toContain('is-dragging');
        pointer('pointermove', 500);
        expect(fixture.componentInstance.widths).withContext(end).toEqual([]);
      }
    });

    it('commits once when a drag that changed the width ends, however it ends', () => {
      pointer('pointerdown', 600);
      pointer('pointermove', 560);
      pointer('pointermove', 540);
      expect(fixture.componentInstance.commits).toBe(0);
      pointer('pointerup', 540);
      pointer('lostpointercapture', 540);
      pointer('pointercancel', 540);
      expect(fixture.componentInstance.commits).toBe(1);
    });

    it('commits nothing for a press that moved nothing', () => {
      pointer('pointerdown', 600);
      pointer('pointerup', 600);
      expect(fixture.componentInstance.commits).toBe(0);
    });

    it('stops following the pointer once the drag ends', () => {
      pointer('pointerdown', 600);
      pointer('pointerup', 600);
      pointer('pointermove', 500);
      expect(fixture.componentInstance.widths).toEqual([]);
    });

    it('ignores a secondary button and a second pointer', () => {
      pointer('pointerdown', 600, { button: 2 });
      pointer('pointermove', 500);
      expect(handle.setPointerCapture).not.toHaveBeenCalled();
      pointer('pointerdown', 600);
      pointer('pointermove', 500, { pointerId: 2 });
      expect(fixture.componentInstance.widths).toEqual([]);
    });

    it('cancels a native drag that starts elsewhere during a drag, and keeps following the pointer', () => {
      pointer('pointerdown', 600);
      expect(nativeDragCancelled()).toBeTrue();
      pointer('pointermove', 560);
      expect(handle.classList).toContain('is-dragging');
      expect(fixture.componentInstance.widths).toEqual([424]);
    });

    it('leaves native drags alone before a press and after the drag ends, however it ends', () => {
      expect(nativeDragCancelled()).toBeFalse();
      for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        pointer('pointerdown', 600);
        expect(nativeDragCancelled()).withContext(end).toBeTrue();
        pointer(end, 600);
        expect(nativeDragCancelled()).withContext(end).toBeFalse();
      }
    });

    it('leaves native drags alone once the handle is destroyed in the middle of a drag', () => {
      pointer('pointerdown', 600);
      expect(nativeDragCancelled()).toBeTrue();
      fixture.destroy();
      expect(nativeDragCancelled()).toBeFalse();
    });

    it('resets to the default width on a double-click', () => {
      handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(fixture.componentInstance.resets).toBe(1);
      expect(fixture.componentInstance.widths).toEqual([]);
    });
  });

  describe('looks', () => {
    it('is a 16 px resize target that the page’s touch gestures leave alone', () => {
      const style = getComputedStyle(handle);
      expect(handle.getBoundingClientRect().width).toBe(16);
      expect(handle.getBoundingClientRect().height).toBe(400);
      expect(style.cursor).toBe('col-resize');
      expect(style.touchAction).toBe('none');
      expect(style.userSelect).toBe('none');
    });

    it('draws a 1 px 30 % phosphor hairline down its middle', () => {
      const line = handle.querySelector('.split-handle__line') as HTMLElement;
      const box = line.getBoundingClientRect();
      const host = handle.getBoundingClientRect();
      expect(box.width).toBe(1);
      expect(box.height).toBe(400);
      expect(box.left - host.left).toBe(7.5);
      expect(getComputedStyle(line).backgroundColor).toBe(
        painted(
          'background-color',
          'color-mix(in srgb, var(--color-phosphor) 30%, transparent)',
        ),
      );
    });

    it('centres an 8 × 40 grip plate on the surface, decoration only', () => {
      const grip = handle.querySelector('.split-handle__grip') as HTMLElement;
      const box = grip.getBoundingClientRect();
      const host = handle.getBoundingClientRect();
      expect(box.width).toBe(8);
      expect(box.height).toBe(40);
      expect(box.left - host.left).toBe(4);
      expect(box.top - host.top).toBe(180);
      expect(grip.getAttribute('aria-hidden')).toBe('true');
      expect(grip.classList).toContain('phosphor-bloom');
      expect(grip.classList).toContain('phosphor-bloom--plate');
      const style = getComputedStyle(grip);
      expect(style.borderTopLeftRadius).toBe('4px');
      expect(style.borderTopColor).toBe(
        painted('border-top-color', 'var(--color-phosphor-deep)'),
      );
      expect(style.backgroundColor).toBe(
        painted('background-color', 'var(--color-surface)'),
      );
    });

    it('marks a drag in progress so the grip lights for it', () => {
      expect(handle.classList).not.toContain('is-dragging');
      pointer('pointerdown', 600);
      expect(handle.classList).toContain('is-dragging');
    });
  });
});

describe('SplitHandleComponent in the Angular zone', () => {
  let fixture: ComponentFixture<HostComponent>;
  let handle: HTMLElement;
  let listening: jasmine.Spy;
  let zoneTurns: number;

  function pointer(type: string, clientX: number): void {
    handle.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        button: 0,
        clientX,
        bubbles: true,
      }),
    );
  }

  /** The zone reports a turn once its microtasks drain, so a turn is only counted after a macrotask. */
  function zoneSettled(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZoneChangeDetection({ eventCoalescing: true })],
    });
    listening = spyOn(
      EventTarget.prototype,
      'addEventListener',
    ).and.callThrough();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    handle = fixture.nativeElement.querySelector('app-split-handle');
    spyOn(handle, 'setPointerCapture');
    spyOn(handle, 'hasPointerCapture').and.returnValue(false);
    zoneTurns = 0;
    TestBed.inject(NgZone).onMicrotaskEmpty.subscribe(() => zoneTurns++);
  });

  afterEach(() => fixture.destroy());

  it('does not listen for pointermove until a drag starts', () => {
    expect(
      listening.calls
        .all()
        .filter((call) => call.object === handle)
        .map((call) => call.args[0]),
    ).not.toContain('pointermove');
  });

  it('costs no zone turn when the pointer hovers over it', async () => {
    pointer('pointermove', 500);
    await zoneSettled();
    expect(zoneTurns).toBe(0);
  });

  it('costs no zone turn when it cancels a native drag', async () => {
    pointer('pointerdown', 600);
    await zoneSettled();
    zoneTurns = 0;
    const event = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    await zoneSettled();
    expect(event.defaultPrevented).toBeTrue();
    expect(zoneTurns).toBe(0);
  });

  it('enters the zone for a drag move that changes the width, and only for that', async () => {
    pointer('pointerdown', 600);
    await zoneSettled();
    zoneTurns = 0;
    pointer('pointermove', 600);
    await zoneSettled();
    expect(zoneTurns).toBe(0);
    pointer('pointermove', 560);
    await zoneSettled();
    expect(zoneTurns).toBeGreaterThan(0);
    expect(fixture.componentInstance.widths).toEqual([424]);
  });
});
