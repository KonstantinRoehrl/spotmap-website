import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverviewBackComponent } from './overview-back.component';

/** The plate in a bare host, counting what it emits. */
@Component({
  imports: [OverviewBackComponent],
  template: `<app-overview-back (back)="backs.set(backs() + 1)" />`,
})
class HostComponent {
  readonly backs = signal(0);
}

describe('OverviewBackComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button',
    )!;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('reads "< OVERVIEW" with a plain ASCII "<" and no count', () => {
    expect(button().textContent!.trim()).toBe('< OVERVIEW');
  });

  it('is named for its visible word, then what a tap does', () => {
    expect(button().getAttribute('aria-label')).toBe(
      'Overview, back to the list',
    );
  });

  it('is a 32 px bloom plate with a 44 px target', () => {
    expect(button().classList).toContain('phosphor-bloom--plate');
    expect(button().classList).toContain('phosphor-bloom--inset');
    expect(button().getBoundingClientRect().height).toBe(32);
    const hit = getComputedStyle(button(), '::after');
    expect([hit.position, hit.top, hit.bottom]).toEqual([
      'absolute',
      '-7px',
      '-7px',
    ]);
    // The ::after is placed against the 30 px padding box, so -7 px each side is 44 px.
    expect(button().clientHeight + 14).toBe(44);
    expect(button().getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
  });

  it('emits back on a click', () => {
    button().click();
    expect(fixture.componentInstance.backs()).toBe(1);
  });
});
