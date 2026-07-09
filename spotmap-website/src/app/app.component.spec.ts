import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeTruthy();
    expect(el.querySelector('app-nav-bar')).toBeFalsy();
  });

  it('skips the intro when it was already seen this browser session', () => {
    sessionStorage.setItem('spotmap:introSeen', '1');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges(); // ngOnInit -> already seen -> reveal content in place

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
});
