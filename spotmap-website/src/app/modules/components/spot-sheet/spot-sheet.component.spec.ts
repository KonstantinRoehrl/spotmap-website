import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpotSheetComponent } from './spot-sheet.component';
import { SheetState } from './spot-sheet-state';

/** A positioned page around the sheet, with a pane projected into it. */
@Component({
  imports: [SpotSheetComponent],
  template: `
    <div style="position: relative; height: 800px; width: 390px">
      <app-spot-sheet
        [state]="state()"
        [availableHeight]="800"
        [count]="count()"
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

  it('takes the height its state asks for: the head, or half the frame', () => {
    expect(create('peek').style.height).toBe('64px');
    fixture.destroy();
    expect(create('list').style.height).toBe('400px');
    fixture.destroy();
    expect(create('detail').style.height).toBe('400px');
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

  it('keeps a decorative grab handle inside the head’s top padding', () => {
    const sheet = create('peek');
    const handle = sheet.querySelector('.spot-sheet__handle')!;
    expect(handle.getAttribute('aria-hidden')).toBe('true');
    const grip = sheet
      .querySelector('.spot-sheet__grip')!
      .getBoundingClientRect();
    const top = sheet.getBoundingClientRect().top;
    expect(grip.top - top).toBeGreaterThan(0);
    expect(grip.bottom - top).toBeLessThanOrEqual(16);
    expect(
      getComputedStyle(sheet.querySelector('.spot-sheet__handle')!)
        .pointerEvents,
    ).toBe('none');
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
