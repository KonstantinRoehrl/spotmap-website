import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';

import {
  AdminAuthError,
  AdminSession,
} from '../../../../services/admin/admin-session';
import { PointerBloomDirective } from '../../../directives/pointer-bloom.directive';

/** The route prefix of the Add page, whose shell-supplied `h1` shows only there. */
const ADD_PAGE_URL = '/admin/add';

/**
 * The guarded admin area's frame: its own header (the public nav bar is hidden on admin routes)
 * with the Add and Spots sections, the signed-in email and Sign out, above the routed admin page.
 * After every navigation it moves focus to the page's `h1` (or the main region when the page has
 * none) so keyboard and screen-reader users land on the new page; each route's `title` names it
 * in the document title.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PointerBloomDirective],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly mainRegion =
    viewChild.required<ElementRef<HTMLElement>>('mainRegion');

  /** The signed-in maintainer's address; empty while signed out. */
  protected readonly email = computed(() => {
    const state = this.session.state();
    return state.status === 'signed-in' ? state.email : '';
  });
  /** Whether a sign-out request is in flight. */
  protected readonly signingOut = signal(false);
  /** Why the last sign-out failed, shown as an alert. */
  protected readonly error = signal<string | null>(null);
  /** The live-region line. */
  protected readonly status = signal('');
  /** Whether the Add page is showing; the Add page has no `h1` of its own, so the shell adds one. */
  protected readonly onAddPage = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.onAddPage.set(event.urlAfterRedirects.startsWith(ADD_PAGE_URL));
        afterNextRender(() => this.focusPageHeading(), {
          injector: this.injector,
        });
      });
  }

  /** Signs out and returns to the sign-in page; on failure stays and shows why. */
  protected async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.error.set(null);
    this.status.set('Signing out…');
    try {
      await this.session.signOut();
      this.status.set('Signed out.');
      await this.router.navigateByUrl('/admin/sign-in');
    } catch (error) {
      this.status.set('');
      this.error.set(
        (error instanceof AdminAuthError
          ? error
          : new AdminAuthError('unknown', error)
        ).message,
      );
    } finally {
      this.signingOut.set(false);
    }
  }

  /**
   * Focuses the routed page's `h1`, or the main region when the page has none, so a route change
   * is announced and the next Tab starts inside the new page. A heading is not focusable by
   * default, so it gets `tabindex="-1"` here (focusable by script, never a Tab stop).
   */
  private focusPageHeading(): void {
    const main = this.mainRegion().nativeElement;
    const target = main.querySelector<HTMLElement>('h1') ?? main;
    if (!target.hasAttribute('tabindex')) {
      target.tabIndex = -1;
    }
    target.focus();
  }
}
