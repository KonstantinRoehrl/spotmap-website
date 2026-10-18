import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';

import {
  AdminAuthError,
  AdminSession,
} from '../../../../services/admin/admin-session';
import { PointerBloomDirective } from '../../../directives/pointer-bloom.directive';

/**
 * The guarded admin area's frame: its own header (the public nav bar is hidden on admin routes)
 * with the Add and Spots sections, the signed-in email and Sign out, above the routed admin page.
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
}
