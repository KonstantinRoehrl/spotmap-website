import { Component } from '@angular/core';
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
    { name: 'Map', url: '/map', icon: '⌖' },
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
