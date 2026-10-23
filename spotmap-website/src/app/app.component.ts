import { Location } from '@angular/common';
import {
  Component,
  signal,
  ChangeDetectionStrategy,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AsciiAnimationTextComponent } from './modules/components/ascii-animation-text/ascii-animation-text.component';
import { NavBarComponent } from './modules/components/nav-bar/nav-bar.component';
import { PointerBloomDirective } from './modules/directives/pointer-bloom.directive';
import { isAdminPath } from './utils/admin-path';

// Session-scoped flag so the intro only plays on the first visit of a browser
// session. Cleared automatically when the tab/session ends.
const INTRO_SEEN_KEY = 'spotmap:introSeen';

/**
 * The app shell: plays the once-per-session ASCII intro (skippable by click, Esc or the
 * `[ SKIP ]` button, which carries the shared pointer bloom), then reveals the nav bar and the
 * routed page. On the hidden admin routes it skips the intro without marking it seen and hides
 * the public nav bar; the admin shell brings its own header.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    AsciiAnimationTextComponent,
    NavBarComponent,
    PointerBloomDirective,
  ],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'spotmap-website';
  protected introFinished = signal<boolean>(false);
  /**
   * Whether the current route is in the admin tree. Read from `Location` at construction — the
   * router's first navigation has not ended yet, and a sign-in link lands here before it — and
   * from every `NavigationEnd` after that.
   */
  protected readonly onAdminRoute = signal(
    isAdminPath(inject(Location).path()),
  );

  constructor() {
    inject(Router)
      .events.pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
        takeUntilDestroyed(),
      )
      .subscribe((event) =>
        this.onAdminRoute.set(isAdminPath(event.urlAfterRedirects)),
      );
  }

  ngOnInit(): void {
    // Already played this session, or opened on an admin route → skip the intro and reveal
    // content immediately (never mount the animation). Deliberately does NOT force a route, so
    // reloading or deep-linking /home, /map, /about or /admin stays on that page. The admin case
    // does not mark the intro seen: the maintainer's first public visit still plays it.
    if (this.onAdminRoute() || this.hasSeenIntro()) {
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
   * Single finish path shared by natural completion and manual skip. Reveals
   * the already-resolved route in place (a deep-linked /about stays /about;
   * root '/' resolves to /map via the route config) and remembers the intro for
   * the session. Reveal is synchronous, so the introFinished() guard alone keeps
   * completion + skip + a bubbling button click to a single finish — no
   * navigation promise to reject and strand the user on the intro screen.
   */
  private finishIntro(): void {
    if (this.introFinished()) return;
    this.markIntroSeen();
    this.introFinished.set(true);
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
