import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AppComponent } from './app.component';

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

  it(`should have the 'spotmap-website' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toEqual('spotmap-website');
  });

  it('shows the intro animation and hides the nav before the intro finishes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeTruthy();
    expect(el.querySelector('app-nav-bar')).toBeFalsy();
  });

  it('skips the intro when it was already seen this browser session', () => {
    sessionStorage.setItem('spotmap:introSeen', '1');
    const fixture = TestBed.createComponent(AppComponent);
    const navSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(
      true,
    );
    fixture.detectChanges(); // ngOnInit -> already seen -> reveal content, no forced nav

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeFalsy();
    expect(el.querySelector('app-nav-bar')).toBeTruthy();
    // Must NOT force /map, so a reloaded/deep-linked route stays put.
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('finishing via a skip click reveals the content and remembers the session', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const navSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(
      true,
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeTruthy();

    (el.querySelector('.intro-wrapper') as HTMLElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navSpy).toHaveBeenCalledWith(['map']);
    expect(el.querySelector('app-nav-bar')).toBeTruthy();
    expect(el.querySelector('app-ascii-animation-text')).toBeFalsy();
    expect(sessionStorage.getItem('spotmap:introSeen')).toBe('1');
  });

  it('does not double-finish when the [ SKIP ] button click bubbles to the wrapper', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const navSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(
      true,
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const skipBtn = el.querySelector('.intro-skip') as HTMLElement;
    expect(skipBtn).toBeTruthy();
    // A native click on the button also bubbles to the wrapper's (click)="skipIntro()"
    // in the same tick; the synchronous `finishing` latch must keep this to ONE finish.
    skipBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navSpy).toHaveBeenCalledTimes(1);
    expect(navSpy).toHaveBeenCalledWith(['map']);
  });
});
