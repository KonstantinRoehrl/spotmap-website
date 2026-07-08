import {
  Component,
  signal,
  ChangeDetectionStrategy,
  HostListener,
  OnInit,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AsciiAnimationTextComponent } from './modules/components/ascii-animation-text/ascii-animation-text.component';
import { NavBarComponent } from './modules/components/nav-bar/nav-bar.component';

// Session-scoped flag so the intro only plays on the first visit of a browser
// session. Cleared automatically when the tab/session ends.
const INTRO_SEEN_KEY = 'spotmap:introSeen';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AsciiAnimationTextComponent, NavBarComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'spotmap-website';
  protected introFinished = signal<boolean>(false);

  // Synchronous latch: introFinished only flips inside navigate().then() (a
  // microtask), so a click on [ SKIP ] bubbling to the wrapper — or Escape
  // firing alongside animationFinished — would re-enter finishIntro() in the
  // same tick before the signal updates. This guards that window.
  private finishing = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Already played this session → skip the intro and reveal content immediately
    // (never mount the animation). Deliberately does NOT force a route, so
    // reloading or deep-linking /home, /map, or /about stays on that page.
    if (this.hasSeenIntro()) {
      this.introFinished.set(true);
    }
  }

  /** Escape from anywhere ends the intro early (a11y skip standard). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.skipIntro();
  }

  /** Click/tap on the intro or the [ SKIP ] button ends it early. */
  protected skipIntro(): void {
    this.finishIntro();
  }

  /** Fired when the typewriter animation completes on its own. */
  protected onIntroFinished(): void {
    this.finishIntro();
  }

  /**
   * Single finish path shared by natural completion and manual skip. Remembers
   * the intro for the session, then lands on /map and reveals the content once
   * navigation resolves. Idempotent so completion + skip can't double-fire.
   */
  private finishIntro(): void {
    if (this.finishing || this.introFinished()) return;
    this.finishing = true;
    this.markIntroSeen();
    void this.router.navigate(['map']).then(() => this.introFinished.set(true));
  }

  private hasSeenIntro(): boolean {
    try {
      return sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
    } catch {
      // Private mode / storage disabled: fail open and just play the intro.
      return false;
    }
  }

  private markIntroSeen(): void {
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      // Storage unavailable: harmless, the intro simply shows again next load.
    }
  }
}
