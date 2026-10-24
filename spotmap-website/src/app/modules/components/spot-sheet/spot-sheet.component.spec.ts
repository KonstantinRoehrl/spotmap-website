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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  it('takes the height its state asks for', () => {
    expect(create('peek').style.height).toBe('60px');
    fixture.destroy();
    expect(create('list').style.height).toBe('400px');
    fixture.destroy();
    expect(create('detail').style.height).toBe('680px');
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
    expect(toggle.getAttribute('aria-label')).toBe('Show list');
    expect(toggle.textContent).toContain('> 9 SPOTS IN VIEW');
    expect(toggle.textContent).toContain('LIST ▲');
    toggle.click();
    expect(fixture.componentInstance.events).toEqual(['head']);
  });

  it('offers to go back to the map from the list', () => {
    const toggle = button(create('list'), '.spot-sheet__toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Show map');
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

  it('heads a detail with back to the list and close', () => {
    const sheet = create('detail');
    expect(sheet.querySelector('.spot-sheet__toggle')).toBeNull();
    const back = button(sheet, '.spot-sheet__back');
    const close = button(sheet, '.spot-sheet__close');
    expect(back.getAttribute('aria-label')).toBe('Back to the list');
    expect(back.textContent!.trim()).toBe('‹ 9 IN VIEW');
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(close.textContent!.trim()).toBe('✕');
    back.click();
    close.click();
    expect(fixture.componentInstance.events).toEqual(['back', 'close']);
  });

  it('gives every head control the shared bloom and a 44px target', () => {
    for (const [state, selectors] of [
      ['peek', ['.spot-sheet__toggle']],
      ['detail', ['.spot-sheet__back', '.spot-sheet__close']],
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
        expect(control.getBoundingClientRect().height)
          .withContext(selector)
          .toBeGreaterThanOrEqual(44);
      }
      fixture.destroy();
    }
    const close = button(create('detail'), '.spot-sheet__close');
    expect(close.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(close.classList).toContain('phosphor-bloom--plate');
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

  it('sits on the surface under a hairline, rounded on top only', () => {
    const style = getComputedStyle(create('list'));
    expect(style.backgroundColor).toBe(
      painted('background-color', 'var(--color-surface)'),
    );
    expect(style.borderTopColor).toBe(
      painted('border-top-color', 'var(--color-line)'),
    );
    expect(style.borderTopLeftRadius).toBe('8px');
    expect(style.borderTopRightRadius).toBe('8px');
    expect(style.borderBottomLeftRadius).toBe('0px');
    expect(style.position).toBe('absolute');
  });

  it('marks its grab handle as decoration', () => {
    const handle = create('peek').querySelector('.spot-sheet__handle')!;
    expect(handle.getAttribute('aria-hidden')).toBe('true');
  });
});
