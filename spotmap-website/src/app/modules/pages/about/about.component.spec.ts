import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AboutComponent } from './about.component';

describe('AboutComponent', () => {
  let component: AboutComponent;
  let fixture: ComponentFixture<AboutComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AboutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  /** The README block headed `heading`. */
  function block(heading: string): HTMLElement | undefined {
    return [...el.querySelectorAll<HTMLElement>('section.block')].find(
      (section) =>
        section.querySelector('.term-heading')?.textContent?.trim() === heading,
    );
  }

  /** What the browser paints for `token` on `property`, for comparing against a computed style. */
  function painted(property: 'text-shadow', token: string): string {
    const probe = document.createElement('span');
    probe.style.setProperty(property, token);
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return value;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('claims every photo for the maintainer, all rights reserved', () => {
    const text = block('PHOTOS')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain(
      "every photo in this archive is the maintainer's own. all rights reserved.",
    );
    expect(text).toContain(
      'no reuse, no reposting, not without asking first and getting a yes.',
    );
  });

  it('gives a mail address to ask for a photo', () => {
    const link = block('PHOTOS')?.querySelector('a');
    expect(link?.getAttribute('href')).toBe(
      'mailto:konstantinroehrl@gmail.com',
    );
    expect(link?.textContent?.trim()).toBe('konstantinroehrl@gmail.com');
  });

  it('places the photo notice between the credits and the disclaimer', () => {
    const headings = [...el.querySelectorAll('.term-heading')].map((h) =>
      h.textContent?.trim(),
    );
    const photos = headings.indexOf('PHOTOS');
    expect(headings[photos - 1]).toBe('CREDITS');
    expect(headings[photos + 1]).toBe('DISCLAIMER');
  });

  it('gives the mail link a thumb-sized target', () => {
    const link = block('PHOTOS')?.querySelector('a') as HTMLElement;
    expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });

  it('lights the section headings in the Display tier', () => {
    const heading = fixture.nativeElement.querySelector('.term-heading');
    expect(getComputedStyle(heading).textShadow).toBe(
      painted('text-shadow', 'var(--glow-text-display)'),
    );
  });

  it('gives the mail link the shared pointer bloom', () => {
    const mail = fixture.nativeElement.querySelector('.mail-link');
    expect(mail.classList).toContain('phosphor-bloom');
  });
});
