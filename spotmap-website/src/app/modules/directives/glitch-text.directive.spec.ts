import { Component, NgZone, provideZoneChangeDetection } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  provideRouter,
} from '@angular/router';

import { GlitchTextDirective } from './glitch-text.directive';

/** A routed page with nothing in it, so navigations have somewhere to land. */
@Component({ template: '' })
class BlankPageComponent {}

/** Hosts the directive; each spec swaps in the link markup it needs. */
@Component({
  imports: [GlitchTextDirective, RouterLink, RouterLinkActive],
  template: '',
})
class HostComponent {}

/** The label every host link carries; the space must survive every frame. */
const LABEL = 'Map it';
/** The directive's frame period, in ms. */
const FRAME = 80;

const PLAIN_LINK = `<a appGlitchText="${LABEL}"><span class="nav-text">${LABEL}</span></a>`;
const ACTIVE_LINK = `<a appGlitchText="${LABEL}" class="active"><span class="nav-text">${LABEL}</span></a>`;
const ROUTED_LINK = `<a routerLink="/a" routerLinkActive="active" appGlitchText="${LABEL}"><span class="nav-text">${LABEL}</span></a>`;
/** A link whose own text has not rendered yet: what an active nav link looks like when the directive starts. */
const ACTIVE_UNRENDERED_LINK = `<a appGlitchText="${LABEL}" class="active"><span class="nav-text"></span></a>`;
/** A plain link whose own text has not rendered yet. */
const PLAIN_UNRENDERED_LINK = `<a appGlitchText="${LABEL}"><span class="nav-text"></span></a>`;

/**
 * Renders `template` in the app's real change-detection mode. TestBed is zoneless by default,
 * where `NgZone` is a no-op and the zone guards below would pass on any code, so the zone is
 * provided explicitly, as `app.config.ts` does.
 */
function render(template: string): ComponentFixture<HostComponent> {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      provideZoneChangeDetection(),
      provideRouter([
        { path: 'a', component: BlankPageComponent },
        { path: 'b', component: BlankPageComponent },
      ]),
    ],
  });
  TestBed.overrideTemplate(HostComponent, template);
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return fixture;
}

/** The directive's host link. */
function link(fixture: ComponentFixture<HostComponent>): HTMLElement {
  return fixture.nativeElement.querySelector('a');
}

/** The scrambled element. */
function navText(fixture: ComponentFixture<HostComponent>): HTMLElement {
  return fixture.nativeElement.querySelector('.nav-text');
}

/**
 * Waits on real time. MutationObserver callbacks are native microtasks that `fakeAsync` does not
 * control, so the specs that go through the class observer run on real timers instead.
 */
function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('GlitchTextDirective', () => {
  let random: jasmine.Spy<() => number>;

  beforeEach(() => {
    // 0 rolls under the 15 % chance and picks glyph 0 ('#') for every character.
    random = spyOn(Math, 'random').and.returnValue(0);
  });

  it('scrambles the label on hover, first on the 80 ms frame', fakeAsync(() => {
    const fixture = render(PLAIN_LINK);
    link(fixture).dispatchEvent(new MouseEvent('mouseenter'));

    tick(FRAME - 1);
    expect(navText(fixture).innerText).toBe(LABEL);
    tick(1);
    expect(navText(fixture).innerText).toBe('### ##');

    fixture.destroy();
  }));

  it('replaces a character only on a roll under 15 %, and never a space', fakeAsync(() => {
    const fixture = render(PLAIN_LINK);
    link(fixture).dispatchEvent(new MouseEvent('mouseenter'));

    random.and.returnValue(0.15);
    tick(FRAME);
    expect(navText(fixture).innerText).toBe(LABEL);

    // 0.1499 rolls under 15 % and picks glyph floor(0.1499 * 12) = 1 ('%').
    random.and.returnValue(0.1499);
    tick(FRAME);
    expect(navText(fixture).innerText).toBe('%%% %%');

    fixture.destroy();
  }));

  it('draws replacement glyphs from its 12-glyph set', fakeAsync(() => {
    const fixture = render(
      '<a appGlitchText="M"><span class="nav-text">M</span></a>',
    );
    link(fixture).dispatchEvent(new MouseEvent('mouseenter'));

    const glyphs: string[] = [];
    for (let i = 0; i < 12; i++) {
      // Per frame: the roll, then the glyph index for a replaced character.
      random.and.returnValues(0, (i + 0.5) / 12);
      tick(FRAME);
      glyphs.push(navText(fixture).innerText);
    }
    expect(glyphs).toEqual([
      '#',
      '%',
      '&',
      '@',
      '*',
      '!',
      '?',
      '/',
      '\\',
      '|',
      '~',
      '$',
    ]);

    fixture.destroy();
  }));

  it('restores the label and stops on mouseleave from a link that is not active', fakeAsync(() => {
    const fixture = render(PLAIN_LINK);
    link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
    tick(FRAME);
    expect(navText(fixture).innerText).toBe('### ##');

    link(fixture).dispatchEvent(new MouseEvent('mouseleave'));
    expect(navText(fixture).innerText).toBe(LABEL);
    tick(FRAME * 10);
    expect(navText(fixture).innerText).toBe(LABEL);

    fixture.destroy();
  }));

  it('scrambles the label it is given, even before the link’s own text has rendered', fakeAsync(() => {
    const fixture = render(ACTIVE_UNRENDERED_LINK);
    tick(FRAME);
    expect(navText(fixture).innerText).toBe('### ##');

    fixture.destroy();
  }));

  it('restores the label it is given, not what the link showed when scrambling began', fakeAsync(() => {
    const fixture = render(PLAIN_UNRENDERED_LINK);
    link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
    tick(FRAME);
    link(fixture).dispatchEvent(new MouseEvent('mouseleave'));
    expect(navText(fixture).innerText).toBe(LABEL);

    fixture.destroy();
  }));

  it('scrambles a link that is active at init, and keeps scrambling it after the pointer leaves', fakeAsync(() => {
    const fixture = render(ACTIVE_LINK);
    tick(FRAME);
    expect(navText(fixture).innerText).toBe('### ##');

    link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
    link(fixture).dispatchEvent(new MouseEvent('mouseleave'));
    expect(navText(fixture).innerText).toBe('### ##');

    random.and.returnValue(0.1499);
    tick(FRAME);
    expect(navText(fixture).innerText).toBe('%%% %%');

    fixture.destroy();
  }));

  it('scrambles while its route is active and restores the label once the route is left', async () => {
    const fixture = render(ROUTED_LINK);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/a');
    fixture.detectChanges();
    await fixture.whenStable();
    await wait(FRAME * 2);
    expect(link(fixture).classList).toContain('active');
    expect(navText(fixture).innerText).toBe('### ##');

    await router.navigateByUrl('/b');
    fixture.detectChanges();
    await fixture.whenStable();
    await wait();
    expect(link(fixture).classList).not.toContain('active');
    expect(navText(fixture).innerText).toBe(LABEL);
    await wait(FRAME * 2);
    expect(navText(fixture).innerText).toBe(LABEL);

    fixture.destroy();
  });

  it('clears its frame interval on destroy', fakeAsync(() => {
    const fixture = render(PLAIN_LINK);
    const text = navText(fixture);
    link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
    tick(FRAME);

    fixture.destroy();
    const frozen = text.textContent;
    random.and.returnValue(0.1499);
    tick(FRAME * 5);
    // fakeAsync also fails the spec if a periodic timer is still queued at its end.
    expect(text.textContent).toBe(frozen);
  }));

  it('disconnects its MutationObserver on destroy', () => {
    const fixture = render(PLAIN_LINK);
    const disconnectSpy = spyOn(
      MutationObserver.prototype,
      'disconnect',
    ).and.callThrough();
    fixture.destroy();
    expect(disconnectSpy).toHaveBeenCalled();
  });

  describe('skipping work', () => {
    it('leaves the text node alone when a frame repeats the scramble', fakeAsync(() => {
      const fixture = render(PLAIN_LINK);
      link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
      tick(FRAME);
      const node = navText(fixture).firstChild;

      tick(FRAME); // Math.random is pinned, so the same '### ##' again
      expect(navText(fixture).firstChild).toBe(node);

      fixture.destroy();
    }));

    it('writes a frame that changes the text', fakeAsync(() => {
      const fixture = render(PLAIN_LINK);
      link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
      tick(FRAME);
      const node = navText(fixture).firstChild;

      random.and.returnValue(0.1499);
      tick(FRAME);
      expect(navText(fixture).firstChild).not.toBe(node);
      expect(navText(fixture).innerText).toBe('%%% %%');

      fixture.destroy();
    }));

    it('still writes the first scramble after a restore', fakeAsync(() => {
      const fixture = render(PLAIN_LINK);
      link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
      tick(FRAME);
      link(fixture).dispatchEvent(new MouseEvent('mouseleave'));
      expect(navText(fixture).innerText).toBe(LABEL);

      link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
      tick(FRAME);
      expect(navText(fixture).innerText).toBe('### ##');

      fixture.destroy();
    }));

    it('writes nothing while the tab is hidden, and scrambles again when it returns', fakeAsync(() => {
      const hidden = spyOnProperty(document, 'hidden').and.returnValue(true);
      const fixture = render(PLAIN_LINK);
      link(fixture).dispatchEvent(new MouseEvent('mouseenter'));

      tick(FRAME * 3);
      expect(navText(fixture).innerText).toBe(LABEL);

      hidden.and.returnValue(false);
      tick(FRAME);
      expect(navText(fixture).innerText).toBe('### ##');

      fixture.destroy();
    }));
  });

  describe('under reduced motion', () => {
    beforeEach(() => {
      spyOn(window, 'matchMedia').and.callFake(
        (query: string) =>
          ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
          }) as MediaQueryList,
      );
    });

    it('never scrambles on hover', fakeAsync(() => {
      const fixture = render(PLAIN_LINK);
      link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
      tick(FRAME * 10);
      expect(navText(fixture).innerText).toBe(LABEL);
      fixture.destroy();
    }));

    it('never scrambles a link that is active at init', fakeAsync(() => {
      const fixture = render(ACTIVE_LINK);
      tick(FRAME * 10);
      expect(navText(fixture).innerText).toBe(LABEL);
      fixture.destroy();
    }));

    it('never scrambles when the link becomes active', async () => {
      const fixture = render(PLAIN_LINK);
      link(fixture).classList.add('active');
      await wait(FRAME * 3);
      expect(navText(fixture).innerText).toBe(LABEL);
      fixture.destroy();
    });
  });

  describe('zone guard', () => {
    it('runs hover-started frames outside the Angular zone', fakeAsync(() => {
      const fixture = render(PLAIN_LINK);
      // The hover listener stays in the zone, so count only from after it.
      link(fixture).dispatchEvent(new MouseEvent('mouseenter'));
      let zoneTurns = 0;
      const subscription = TestBed.inject(NgZone).onMicrotaskEmpty.subscribe(
        () => zoneTurns++,
      );

      tick(FRAME * 10);
      expect(navText(fixture).innerText).toBe('### ##');
      expect(zoneTurns).toBe(0);

      subscription.unsubscribe();
      fixture.destroy();
    }));

    it('runs frames of a link active at init outside the Angular zone', fakeAsync(() => {
      // render() runs ngOnInit inside the zone's detectChanges, so count only from after it.
      const fixture = render(ACTIVE_LINK);
      let zoneTurns = 0;
      const subscription = TestBed.inject(NgZone).onMicrotaskEmpty.subscribe(
        () => zoneTurns++,
      );

      tick(FRAME * 10);
      expect(navText(fixture).innerText).toBe('### ##');
      expect(zoneTurns).toBe(0);

      subscription.unsubscribe();
      fixture.destroy();
    }));
  });
});
