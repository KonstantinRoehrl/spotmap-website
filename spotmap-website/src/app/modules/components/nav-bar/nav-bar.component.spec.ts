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
});
