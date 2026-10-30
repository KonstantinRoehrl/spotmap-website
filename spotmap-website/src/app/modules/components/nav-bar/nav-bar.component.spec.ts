import { Component, signal } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { NavBarComponent, NavBarLink } from './nav-bar.component';

// Minimal stand-in for the lazy pages so the router has something to activate.
@Component({ template: '' })
class StubPageComponent {}

@Component({
  imports: [NavBarComponent],
  template: '<app-nav-bar [links]="links" />',
})
class HostComponent {
  links: NavBarLink[] = [
    { name: 'Home', url: '/home', icon: '⌂' },
    { name: 'Map', url: '/map', icon: '⌖', activeAlsoUnder: '/spot/' },
    { name: 'About', url: '/about', icon: 'ⓘ' },
  ];
}

describe('NavBarComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideRouter([
          { path: 'home', component: StubPageComponent },
          { path: 'map', component: StubPageComponent },
          { path: 'about', component: StubPageComponent },
          { path: 'spot/:id', component: StubPageComponent },
        ]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    router = TestBed.inject(Router);
  });

  /** Labels of the links currently carrying the `active` class. */
  function activeLabels(): string[] {
    const el = fixture.nativeElement as HTMLElement;
    return Array.from(el.querySelectorAll('a.active')).map((a) =>
      (a.querySelector('.nav-text')?.textContent ?? '').trim(),
    );
  }

  it('should create', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('highlights the link for the current route, not a hardcoded default', fakeAsync(() => {
    fixture.detectChanges();
    // Deep-linking straight to /about (the old bug wrongly kept "Map" lit).
    fixture.ngZone!.run(() => router.navigate(['/about']));
    tick();
    fixture.detectChanges();

    expect(activeLabels()).toEqual(['About']);
  }));

  it('moves the highlight when the route changes', fakeAsync(() => {
    fixture.detectChanges();

    fixture.ngZone!.run(() => router.navigate(['/map']));
    tick();
    fixture.detectChanges();
    expect(activeLabels()).toEqual(['Map']);

    fixture.ngZone!.run(() => router.navigate(['/home']));
    tick();
    fixture.detectChanges();
    expect(activeLabels()).toEqual(['Home']);
  }));

  it('lights the Map link on a spot link too, and no other link', fakeAsync(() => {
    fixture.detectChanges();
    fixture.ngZone!.run(() => router.navigateByUrl('/spot/hbf-curb-99f6e5'));
    tick();
    fixture.detectChanges();
    // Home and About carry no activeAlsoUnder, so they stay exact.
    expect(activeLabels()).toEqual(['Map']);
  }));

  it('ignores the query string and fragment when lighting a link', fakeAsync(() => {
    fixture.detectChanges();
    fixture.ngZone!.run(() => router.navigateByUrl('/about?from=nav#team'));
    tick();
    fixture.detectChanges();
    expect(activeLabels()).toEqual(['About']);
  }));

  it('lights the link for the route the app opened on, before any navigation of its own', fakeAsync(() => {
    fixture.ngZone!.run(() => router.navigateByUrl('/home'));
    tick();
    // The nav is created only now, after the navigation has ended.
    fixture.detectChanges();
    expect(activeLabels()).toEqual(['Home']);
  }));

  /** The nav's link for `label`. */
  function link(label: string): HTMLAnchorElement {
    const el = fixture.nativeElement as HTMLElement;
    return Array.from(el.querySelectorAll('a')).find(
      (a) => a.querySelector('.nav-text')?.textContent?.trim() === label,
    )!;
  }

  it('gives every link the shared pointer bloom', () => {
    fixture.detectChanges();
    for (const label of ['Home', 'Map', 'About']) {
      expect(link(label).classList)
        .withContext(label)
        .toContain('phosphor-bloom');
    }
  });

  it('contains the label to its own subtree, with the clip edge past its 6 px glow', () => {
    fixture.detectChanges();
    const label = fixture.nativeElement.querySelector('.nav-text');
    const style = getComputedStyle(label);
    expect(style.contain).toBe('layout paint');
    expect(style.paddingLeft).toBe('6px');
    expect(style.paddingTop).toBe('6px');
    expect(style.marginLeft).toBe('-6px');
    expect(style.marginTop).toBe('-6px');
  });

  it('keeps tracking the pointer after a touch that missed every link', () => {
    fixture.detectChanges();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav')!;
    nav.dispatchEvent(new Event('touchstart', { bubbles: true }));
    const map = link('Map');
    spyOn(map, 'getBoundingClientRect').and.returnValue(
      new DOMRect(0, 0, 100, 40),
    );
    map.dispatchEvent(
      new PointerEvent('pointerenter', { clientX: 0, clientY: 0 }),
    );
    map.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 50,
        clientY: 10,
        bubbles: true,
      }),
    );
    expect(map.style.getPropertyValue('--x')).toBe('50%');
    expect(map.style.getPropertyValue('--y')).toBe('25%');
  });

  it('leaves no timer behind after a tap on a link', fakeAsync(() => {
    fixture.detectChanges();
    link('Map').dispatchEvent(new Event('touchstart', { bubbles: true }));
    // fakeAsync fails the test if any timer is still queued here.
  }));
});

/** The directive's frame period, in ms. */
const FRAME = 80;

/**
 * Waits on real time. The class observer that stops a link's scramble when it loses `active`
 * reports in a native microtask, which `fakeAsync` does not control, so this spec runs on real
 * timers (as the directive's own route spec does).
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates the nav only once `show` is set, as the app shell does after the welcome intro, when the
 * router's first navigation may long have ended.
 */
@Component({
  imports: [NavBarComponent],
  template: '@if (show()) { <app-nav-bar [links]="links" /> }',
})
class LateHostComponent {
  readonly show = signal(false);
  readonly links: NavBarLink[] = [
    { name: 'Home', url: '/home', icon: '⌂' },
    { name: 'Map', url: '/map', icon: '⌖', activeAlsoUnder: '/spot/' },
    { name: 'About', url: '/about', icon: 'ⓘ' },
  ];
}

describe('NavBarComponent created after the first navigation', () => {
  let fixture: ComponentFixture<LateHostComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LateHostComponent],
      providers: [
        provideRouter([
          { path: 'home', component: StubPageComponent },
          { path: 'map', component: StubPageComponent },
          { path: 'about', component: StubPageComponent },
        ]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LateHostComponent);
    router = TestBed.inject(Router);
  });

  afterEach(() => fixture.destroy());

  /** Every link's label as it reads now, in display order. */
  function labels(): string[] {
    const el = fixture.nativeElement as HTMLElement;
    return Array.from(el.querySelectorAll('.nav-text')).map(
      (text) => text.textContent ?? '',
    );
  }

  it('keeps the active link’s label, and gives it back whole once the link is left', async () => {
    // 0 rolls under the 15 % chance and picks '#' for every character, so a running frame shows.
    spyOn(Math, 'random').and.returnValue(0);
    fixture.detectChanges();
    await router.navigateByUrl('/map');

    fixture.componentInstance.show.set(true);
    fixture.detectChanges();
    await wait(FRAME * 2);
    // Scrambled, glyph for glyph: three characters, not the empty label of the bug.
    expect(labels()[1]).toBe('###');

    await router.navigateByUrl('/home');
    fixture.detectChanges();
    await wait(FRAME * 2);
    expect(labels()).toEqual(['####', 'Map', 'About']);
  });
});
