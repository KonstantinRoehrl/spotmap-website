import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

/** A routed page with nothing in it, so navigations have somewhere to land. */
@Component({ template: '' })
class BlankPageComponent {}

describe('AppComponent', () => {
  beforeEach(async () => {
    // Isolate the once-per-session flag so tests don't leak into each other.
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the intro animation and hides the nav before the intro finishes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeTruthy();
    expect(el.querySelector('app-nav-bar')).toBeFalsy();
  });

  it('skips the intro when it was already seen this browser session', () => {
    sessionStorage.setItem('spotmap:introSeen', '1');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges(); // seen at construction -> reveal content in place

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeFalsy();
    expect(el.querySelector('app-nav-bar')).toBeTruthy();
    // Reveal must not force a route, so a reloaded/deep-linked page stays put.
    // (finishIntro no longer navigates at all — the router keeps the resolved
    // route and the outlet renders it once revealed.)
  });

  it('finishing via a skip click reveals the content in place and remembers the session', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeTruthy();

    (el.querySelector('.intro-wrapper') as HTMLElement).click();
    fixture.detectChanges();

    expect(el.querySelector('app-nav-bar')).toBeTruthy();
    expect(el.querySelector('app-ascii-animation-text')).toBeFalsy();
    expect(sessionStorage.getItem('spotmap:introSeen')).toBe('1');
  });

  it('does not double-finish when the [ SKIP ] button click bubbles to the wrapper', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    // markIntroSeen() is the single side effect of a finish. A native click on
    // the button also bubbles to the wrapper's (click)="skipIntro()" in the same
    // tick; the synchronous introFinished() guard must keep this to ONE finish.
    const seenSpy = spyOn(
      fixture.componentInstance as unknown as { markIntroSeen: () => void },
      'markIntroSeen',
    ).and.callThrough();

    const el = fixture.nativeElement as HTMLElement;
    const skipBtn = el.querySelector('.intro-skip') as HTMLElement;
    expect(skipBtn).toBeTruthy();
    skipBtn.click();
    fixture.detectChanges();

    expect(seenSpy).toHaveBeenCalledTimes(1);
    expect(el.querySelector('app-ascii-animation-text')).toBeFalsy();
  });

  it('gives [ SKIP ] the shared pointer bloom', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const skip = (fixture.nativeElement as HTMLElement).querySelector(
      '.intro-skip',
    )!;
    expect(skip.classList).toContain('phosphor-bloom');
  });
});

describe('AppComponent on the admin routes', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: 'admin', component: BlankPageComponent },
          { path: 'map', component: BlankPageComponent },
        ]),
        provideLocationMocks(),
      ],
    }).compileComponents();
  });

  it('skips the intro and hides the public nav bar when the app opens on an admin path', () => {
    TestBed.inject(Location).go('/admin/sign-in');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeNull();
    expect(el.querySelector('app-nav-bar')).toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
    // The public intro still plays on the maintainer's first public visit.
    expect(sessionStorage.getItem('spotmap:introSeen')).toBeNull();
  });

  it('hides the public nav bar after navigating into the admin routes, and shows it again outside them', async () => {
    sessionStorage.setItem('spotmap:introSeen', '1');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-nav-bar')).not.toBeNull();

    await TestBed.inject(Router).navigateByUrl('/admin');
    fixture.detectChanges();
    expect(el.querySelector('app-nav-bar')).toBeNull();

    await TestBed.inject(Router).navigateByUrl('/map');
    fixture.detectChanges();
    expect(el.querySelector('app-nav-bar')).not.toBeNull();
  });
});
