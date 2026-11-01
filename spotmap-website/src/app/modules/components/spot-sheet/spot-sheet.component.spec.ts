import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpotSheetComponent } from './spot-sheet.component';
import { SheetState } from './spot-sheet-state';

/** A positioned page around the sheet, with a pane projected into it. */
@Component({
  imports: [SpotSheetComponent],
  template: `
    <div
      style="position: relative; height: 800px; width: 390px; --space-gutter: 16px"
    >
      <app-spot-sheet
        [state]="state()"
        [full]="full()"
        [availableHeight]="800"
        [pageHeight]="784"
        [count]="count()"
        (settle)="events.push('settle:' + $event)"
        (headTap)="events.push('head')"
        (back)="events.push('back')"
        (close)="events.push('close')"
      >
        <p class="pane">PANE</p>
      </app-spot-sheet>
    </div>
  `,
})
class HostComponent {
  readonly state = signal<SheetState>('peek');
  readonly full = signal(false);
  readonly count = signal<number | null>(9);
  readonly events: string[] = [];
}

describe('SpotSheetComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  /** What the browser paints for a token, so assertions compare rendered values. */
  function painted(property: string, token: string): string {
    const probe = document.createElement('span');
    probe.style.setProperty(property, token);
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return value;
  }

  /** Renders the sheet in `state`, set before the first render so no head crossfade is in flight. */
  function create(state: SheetState, count: number | null = 9): HTMLElement {
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.state.set(state);
    fixture.componentInstance.count.set(count);
    fixture.detectChanges();
    // A fixture's detectChanges runs no render hooks, so the head's drag attaches on a tick.
    TestBed.tick();
    return (fixture.nativeElement as HTMLElement).querySelector(
      'app-spot-sheet',
    ) as HTMLElement;
  }

  const button = (sheet: HTMLElement, selector: string) =>
    sheet.querySelector(selector) as HTMLButtonElement;

  /** The detail head's back plate, drawn by the shared overview-back component. */
  const backPlate = 'app-overview-back button';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  it('takes the height its state asks for: the head, half the frame, or the page', () => {
    const height = (sheet: HTMLElement) => getComputedStyle(sheet).height;
    expect(height(create('peek'))).toBe('64px');
    fixture.destroy();
    expect(height(create('list'))).toBe('400px');
    fixture.destroy();
    expect(height(create('detail'))).toBe('400px');
    fixture.destroy();
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.state.set('list');
    fixture.componentInstance.full.set(true);
    fixture.detectChanges();
    expect(
      height(
        (fixture.nativeElement as HTMLElement).querySelector(
          'app-spot-sheet',
        ) as HTMLElement,
      ),
    ).toBe('784px');
  });

  it('eases between heights', () => {
    const style = getComputedStyle(create('peek'));
    expect(style.transitionProperty).toContain('height');
    expect(style.transitionDuration).toContain('0.33s');
  });

  it('peeks with the count and a tap that shows the list', () => {
    const sheet = create('peek');
    const toggle = button(sheet, '.spot-sheet__toggle');
    expect(toggle.type).toBe('button');
    // The visible words (the count) lead the name, then what a tap does.
    expect(toggle.getAttribute('aria-label')).toBe(
      '9 spots in view, show list',
    );
    expect(toggle.textContent).toContain('> 9 SPOTS IN VIEW');
    expect(toggle.textContent).toContain('LIST ▲');
    toggle.click();
    expect(fixture.componentInstance.events).toEqual(['head']);
  });

  it('offers to go back to the map from the list', () => {
    const toggle = button(create('list'), '.spot-sheet__toggle');
    expect(toggle.getAttribute('aria-label')).toBe('9 spots in view, show map');
    expect(toggle.textContent).toContain('MAP ▼');
  });

  it('counts one spot in the singular and says when the count is not known yet', () => {
    expect(
      button(create('peek', 1), '.spot-sheet__toggle').textContent,
    ).toContain('> 1 SPOT IN VIEW');
    fixture.destroy();
    expect(
      button(create('peek', null), '.spot-sheet__toggle').textContent,
    ).toContain('> LOADING SPOTS…');
  });

  it('names the head controls with their visible words while the count is unknown or one', () => {
    const toggle = (state: SheetState, count: number | null) =>
      button(create(state, count), '.spot-sheet__toggle').getAttribute(
        'aria-label',
      );
    expect(toggle('peek', 1)).toBe('1 spot in view, show list');
    fixture.destroy();
    expect(toggle('peek', null)).toBe('Loading spots, show list');
  });

  it('heads a detail with the overview back plate, whatever the count, and close', () => {
    for (const count of [null, 1, 9]) {
      const sheet = create('detail', count);
      expect(sheet.querySelector('.spot-sheet__toggle')).toBeNull();
      const back = button(sheet, backPlate);
      expect(back.textContent!.trim())
        .withContext(`count ${count}`)
        .toBe('< OVERVIEW');
      expect(back.getAttribute('aria-label'))
        .withContext(`count ${count}`)
        .toBe('Overview, back to the list');
      fixture.destroy();
    }
    const sheet = create('detail');
    const close = button(sheet, '.spot-sheet__close');
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(close.textContent!.trim()).toBe('✕');
    button(sheet, backPlate).click();
    expect(fixture.componentInstance.events).toEqual(['back']);
    close.click();
    expect(fixture.componentInstance.events).toEqual(['back', 'close']);
  });

  it('gives every head control the shared bloom', () => {
    for (const [state, selectors] of [
      ['peek', ['.spot-sheet__toggle']],
      ['detail', [backPlate, '.spot-sheet__close']],
    ] as const) {
      const sheet = create(state);
      for (const selector of selectors) {
        const control = button(sheet, selector);
        expect(control.classList)
          .withContext(selector)
          .toContain('phosphor-bloom');
        expect(control.classList)
          .withContext(selector)
          .toContain('phosphor-bloom--inset');
      }
      fixture.destroy();
    }
    const close = button(create('detail'), '.spot-sheet__close');
    expect(close.classList).toContain('phosphor-bloom--plate');
    expect(button(fixture.nativeElement, backPlate).classList).toContain(
      'phosphor-bloom--plate',
    );
  });

  it('makes the whole 64 px head the toggle’s target, its words 16 px from the sheet’s edges', () => {
    const sheet = create('peek');
    const toggle = button(sheet, '.spot-sheet__toggle');
    const box = toggle.getBoundingClientRect();
    const frame = sheet.getBoundingClientRect();
    expect(box.height).toBe(64);
    expect(box.left).toBe(frame.left);
    expect(box.right).toBe(frame.right);
    const [count, hint] = Array.from(toggle.querySelectorAll('span'));
    expect(count.getBoundingClientRect().left - frame.left).toBe(16);
    expect(frame.right - hint.getBoundingClientRect().right).toBe(16);
  });

  it('draws the overview and close plates 32 px tall, 16 px in, with a 44 px target', () => {
    const sheet = create('detail');
    sheet.scrollIntoView({ block: 'start' });
    const frame = sheet.getBoundingClientRect();
    const back = button(sheet, backPlate);
    const close = button(sheet, '.spot-sheet__close');
    const backBox = back.getBoundingClientRect();
    const closeBox = close.getBoundingClientRect();

    expect(backBox.height).toBe(32);
    expect(closeBox.height).toBe(32);
    expect(closeBox.width).toBe(32);
    expect(backBox.top - frame.top).toBe(16);
    expect(backBox.left - frame.left).toBe(16);
    expect(frame.right - closeBox.right).toBe(16);

    /** The control the pointer reaches at a point, through any pseudo-element hit area. */
    const hit = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest('button') ?? null;
    const middle = (box: DOMRect) => box.left + box.width / 2;
    for (const [control, box] of [
      [back, backBox],
      [close, closeBox],
    ] as const) {
      expect(hit(middle(box), box.top - 5))
        .withContext(`${control.className} above`)
        .toBe(control);
      expect(hit(middle(box), box.bottom + 5))
        .withContext(`${control.className} below`)
        .toBe(control);
    }
    expect(hit(closeBox.left - 5, closeBox.top + 16)).toBe(close);
    expect(hit(closeBox.right + 5, closeBox.top + 16)).toBe(close);
  });

  it('projects its pane and shuts it away at peek', () => {
    const peek = create('peek');
    const body = peek.querySelector('.spot-sheet__body') as HTMLElement;
    expect(body.querySelector('.pane')).not.toBeNull();
    expect(body.inert).toBeTrue();
    fixture.destroy();
    const list = create('list');
    expect(
      (list.querySelector('.spot-sheet__body') as HTMLElement).inert,
    ).toBeFalse();
  });

  it('fades the pane out by opacity alone, so the reduced-motion net keeps the fade', () => {
    for (const state of ['peek', 'list'] as const) {
      const body = create(state).querySelector(
        '.spot-sheet__body',
      ) as HTMLElement;
      const style = getComputedStyle(body);
      // Visibility cannot transition under the net, which would cut the fade; inert hides the
      // closed pane from reach and from assistive tech instead.
      expect(style.transitionProperty).withContext(state).toBe('opacity');
      expect(style.visibility).withContext(state).toBe('visible');
      fixture.destroy();
    }
  });

  it('sits on the surface in a 1 px line frame, rounded on every corner', () => {
    const sheet = create('list');
    const style = getComputedStyle(sheet);
    expect(style.backgroundColor).toBe(
      painted('background-color', 'var(--color-surface)'),
    );
    for (const corner of [
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomLeftRadius',
      'borderBottomRightRadius',
    ] as const) {
      expect(style[corner]).withContext(corner).toBe('8px');
    }
    expect(style.position).toBe('absolute');
    // The frame line is drawn over the content, so it takes none of the 64 px.
    expect(style.borderTopWidth).toBe('0px');
    const line = getComputedStyle(sheet, '::after');
    for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
      expect(line.getPropertyValue(`border-${side.toLowerCase()}-width`))
        .withContext(side)
        .toBe('1px');
      expect(line.getPropertyValue(`border-${side.toLowerCase()}-color`))
        .withContext(side)
        .toBe(painted('border-top-color', 'var(--color-line)'));
    }
    expect(line.borderTopLeftRadius).toBe('8px');
    expect(line.pointerEvents).toBe('none');
  });

  it('draws the grip as a 40 × 8 plate inside the head’s top padding', () => {
    const sheet = create('peek');
    const grip = sheet.querySelector<HTMLElement>('.spot-sheet__grip')!;
    const box = grip.getBoundingClientRect();
    const top = sheet.getBoundingClientRect().top;
    expect(box.width).toBe(40);
    expect(box.height).toBe(8);
    expect(box.top - top).toBeGreaterThan(0);
    expect(box.bottom - top).toBeLessThanOrEqual(16);
    const style = getComputedStyle(grip);
    expect(style.borderTopLeftRadius).toBe('4px');
    expect(style.borderTopWidth).toBe('1px');
    expect(grip.classList).toContain('phosphor-bloom');
  });

  it('gives the handle an 88 × 44 target above the toggle', () => {
    const sheet = create('peek');
    const handle = sheet.querySelector<HTMLElement>('.spot-sheet__handle')!;
    const box = handle.getBoundingClientRect();
    expect(box.width).toBe(88);
    expect(box.height).toBe(44);
    sheet.scrollIntoView({ block: 'start' });
    const again = handle.getBoundingClientRect();
    expect(
      document
        .elementFromPoint(again.left + 44, again.top + 22)
        ?.closest('.spot-sheet__handle'),
    ).toBe(handle);
  });

  it('leaves the plates above the handle where they meet', () => {
    const sheet = create('detail');
    sheet.scrollIntoView({ block: 'start' });
    const close = button(sheet, '.spot-sheet__close');
    const box = close.getBoundingClientRect();
    expect(
      document.elementFromPoint(box.left + 16, box.top + 16)?.closest('button'),
    ).toBe(close);
  });

  it('exposes the handle as a named separator valued by height', () => {
    const handle = create('peek').querySelector<HTMLElement>(
      '.spot-sheet__handle',
    )!;
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('tabindex')).toBe('0');
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
    expect(handle.getAttribute('aria-label')).toBe('Resize spot sheet');
    expect(handle.getAttribute('aria-valuenow')).toBe('0');
    expect(handle.getAttribute('aria-valuetext')).toBe('Closed');
    fixture.destroy();
    const half = create('list').querySelector('.spot-sheet__handle')!;
    expect(half.getAttribute('aria-valuenow')).toBe('50');
    expect(half.getAttribute('aria-valuetext')).toBe('Half height');
  });

  it('moves through the handle’s tap', () => {
    const sheet = create('list');
    sheet.querySelector<HTMLElement>('.spot-sheet__handle')!.click();
    expect(fixture.componentInstance.events).toEqual(['settle:full']);
  });

  it('moves by the handle’s keys', () => {
    const press = (key: string) => {
      fixture.componentInstance.events.length = 0;
      fixture.nativeElement.querySelector('.spot-sheet__handle').dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );
      return fixture.componentInstance.events;
    };
    create('list');
    expect(press('ArrowUp')).toEqual(['settle:full']);
    expect(press('ArrowDown')).toEqual(['settle:peek']);
    expect(press('Home')).toEqual(['settle:peek']);
    expect(press('End')).toEqual(['settle:full']);
    expect(press('Enter')).toEqual(['settle:full']);
    expect(press(' ')).toEqual(['settle:full']);
    expect(press('a')).toEqual([]);
  });

  it('eases the gutters and bottom radii with the height, and rests at full on the page’s edges', () => {
    const sheet = create('list');
    const properties = getComputedStyle(sheet).transitionProperty;
    for (const name of [
      'left',
      'right',
      'bottom',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
    ]) {
      expect(properties).withContext(name).toContain(name);
    }
    expect(getComputedStyle(sheet).left).toBe('16px');
    fixture.componentInstance.full.set(true);
    fixture.detectChanges();
    sheet.getAnimations().forEach((animation) => animation.finish());
    const style = getComputedStyle(sheet);
    expect(style.left).toBe('0px');
    expect(style.bottom).toBe('0px');
    expect(style.borderBottomLeftRadius).toBe('0px');
    expect(style.borderTopLeftRadius).toBe('8px');
  });

  describe('dragging the head', () => {
    let sheet: HTMLElement;
    let head: HTMLElement;

    /** Fires a pointer event for pointer 1 at `y`. */
    function pointer(target: EventTarget, type: string, y: number): void {
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    beforeEach(() => {
      sheet = create('list');
      head = sheet.querySelector<HTMLElement>('.spot-sheet__head')!;
      spyOn(head, 'setPointerCapture');
      spyOn(head, 'hasPointerCapture').and.returnValue(false);
    });

    it('stays a tap under 8 px of travel', () => {
      pointer(head, 'pointerdown', 300);
      pointer(document, 'pointermove', 295);
      pointer(document, 'pointerup', 295);
      expect(sheet.style.getPropertyValue('--sheet-drag-height')).toBe('');
      expect(fixture.componentInstance.events).toEqual([]);
    });

    it('follows the finger 1:1 from where it passed 8 px', () => {
      pointer(head, 'pointerdown', 300);
      pointer(document, 'pointermove', 290);
      fixture.detectChanges();
      expect(sheet.classList).toContain('spot-sheet--dragging');
      pointer(document, 'pointermove', 250);
      expect(sheet.style.getPropertyValue('--sheet-drag-height')).toBe('440px');
      expect(fixture.componentInstance.events).toEqual([]);
    });

    it('shows the pane while dragging up from peek', () => {
      fixture.destroy();
      sheet = create('peek');
      head = sheet.querySelector<HTMLElement>('.spot-sheet__head')!;
      spyOn(head, 'setPointerCapture');
      pointer(head, 'pointerdown', 300);
      pointer(document, 'pointermove', 280);
      fixture.detectChanges();
      const body = sheet.querySelector<HTMLElement>('.spot-sheet__body')!;
      expect(body.inert).toBeFalse();
      expect(body.classList).not.toContain('spot-sheet__body--hidden');
    });

    it('settles on release and clears its own writes, even when it eases back', () => {
      pointer(head, 'pointerdown', 300);
      pointer(document, 'pointermove', 290);
      pointer(document, 'pointerup', 290);
      expect(fixture.componentInstance.events).toEqual(['settle:half']);
      expect(sheet.style.getPropertyValue('--sheet-drag-height')).toBe('');
      expect(sheet.style.getPropertyValue('--sheet-drag-rise')).toBe('');
    });

    it('treats a cancelled pointer as a slow release', () => {
      pointer(head, 'pointerdown', 300);
      pointer(document, 'pointermove', 290);
      pointer(document, 'pointercancel', 290);
      expect(fixture.componentInstance.events).toEqual(['settle:half']);
    });

    it('never starts on a plate', () => {
      fixture.destroy();
      sheet = create('detail');
      const close = button(sheet, '.spot-sheet__close');
      head = sheet.querySelector<HTMLElement>('.spot-sheet__head')!;
      pointer(close, 'pointerdown', 300);
      pointer(document, 'pointermove', 250);
      pointer(document, 'pointerup', 250);
      expect(sheet.style.getPropertyValue('--sheet-drag-height')).toBe('');
      expect(fixture.componentInstance.events).toEqual([]);
    });

    it('swallows the click a drag’s release might still raise on the toggle', () => {
      const toggle = button(sheet, '.spot-sheet__toggle');
      pointer(toggle, 'pointerdown', 300);
      pointer(document, 'pointermove', 280);
      pointer(document, 'pointerup', 280);
      toggle.click();
      expect(fixture.componentInstance.events).not.toContain('head');
    });
  });

  it('rules the head off from the pane only while the sheet is open', () => {
    const rule = (state: SheetState) => {
      const head = create(state).querySelector('.spot-sheet__head')!;
      const after = getComputedStyle(head, '::after');
      const value = {
        opacity: after.opacity,
        height: after.height,
        transition: after.transitionProperty,
      };
      fixture.destroy();
      return value;
    };
    expect(rule('peek')).toEqual({
      opacity: '0',
      height: '1px',
      transition: 'opacity',
    });
    expect(rule('list').opacity).toBe('1');
    expect(rule('detail').opacity).toBe('1');
  });
});
