import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  NgZone,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import {
  AdminAuthError,
  AdminSession,
} from '../../../../services/admin/admin-session';
import { PointerBloomDirective } from '../../../directives/pointer-bloom.directive';

/** Which part of the sign-in flow the page shows. `checking` lasts until the session has loaded. */
export type SignInStep = 'checking' | 'email' | 'code' | 'denied';

/** Seconds before "send a new code" unlocks: Supabase Auth's default per-address OTP interval. */
export const RESEND_DELAY_S = 60;

/** A code is exactly six digits. */
const CODE_LENGTH = 6;

/**
 * The maintainer sign-in page (`/admin/sign-in`): an email field that mails a magic link and a
 * 6-digit code, then a code field, so a link that opens in the wrong browser costs no second
 * email. A signed-in admin is sent on to `/admin`; a signed-in non-admin (the guard's
 * `?denied=1`) is told the account is not a maintainer and offered sign-out. Steps crossfade in
 * place, focus moves to each new step's heading, and status is announced politely.
 */
@Component({
  selector: 'app-admin-sign-in',
  imports: [PointerBloomDirective],
  templateUrl: './admin-sign-in.component.html',
  styleUrls: ['../../terminal-window.css', './admin-sign-in.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSignInComponent implements OnInit {
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private readonly stepHeading =
    viewChild<ElementRef<HTMLElement>>('stepHeading');
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  /** The visible step. */
  protected readonly step = signal<SignInStep>('checking');
  /** The request in flight, which disables the controls that would start another. */
  protected readonly busy = signal<
    'sending' | 'verifying' | 'signing-out' | null
  >(null);
  /** The last failure, shown as an alert under the step and tied to its field. */
  protected readonly error = signal<AdminAuthError | null>(null);
  /** The live-region line: what is happening now. */
  protected readonly status = signal('Checking the session…');
  /** The address typed in, and later the one the code went to. */
  protected readonly email = signal('');
  /** The digits typed so far. */
  protected readonly code = signal('');
  /** Seconds until "send a new code" unlocks; 0 when it is available. */
  protected readonly resendIn = signal(0);
  /** The signed-in non-admin's address, for the denied step. */
  protected readonly signedInEmail = signal('');
  /** Whether the visitor arrived from a sign-in link that failed (expired or already used). */
  protected readonly linkFailed = computed(() => {
    const state = this.session.state();
    return state.status === 'signed-out' && state.linkError !== null;
  });
  /** Whether the code field holds all six digits. */
  protected readonly codeComplete = computed(
    () => this.code().length === CODE_LENGTH,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopResendTimer());
  }

  /** Waits for the session to load, then shows the step it calls for (or why it could not load). */
  ngOnInit(): void {
    void this.session.ready().then(
      () => this.showSessionStep(),
      (error: unknown) => {
        this.fail(error);
        this.show('email');
      },
    );
  }

  /** Mails the link and code (the email form's submit, and "send a new code"). */
  protected async send(event?: Event): Promise<void> {
    event?.preventDefault();
    const email = this.email().trim();
    if (this.busy() !== null || email === '') return;
    this.error.set(null);
    this.busy.set('sending');
    this.status.set('Sending the link and code…');
    try {
      await this.session.requestSignIn(email);
      this.email.set(email);
      this.code.set('');
      this.startResendTimer();
      this.status.set(
        `Sent to ${email}. Open the link on this device, or type the 6-digit code.`,
      );
      this.show('code');
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(null);
    }
  }

  /** Signs in with the typed code (the code form's submit). */
  protected async verify(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() !== null || !this.codeComplete()) return;
    this.error.set(null);
    this.busy.set('verifying');
    this.status.set('Checking the code…');
    try {
      await this.session.verifyCode(this.email(), this.code());
      this.status.set('Signed in.');
      this.showSessionStep();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(null);
    }
  }

  /** Keeps only digits, at most six, and writes the cleaned value back into the field. */
  protected onCodeInput(field: HTMLInputElement): void {
    const digits = field.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    field.value = digits;
    this.code.set(digits);
  }

  /** Returns to the email step to send to another address. */
  protected useAnotherEmail(): void {
    this.stopResendTimer();
    this.resendIn.set(0);
    this.code.set('');
    this.error.set(null);
    this.status.set('');
    this.show('email');
  }

  /** Signs the non-admin account out (the denied step). */
  protected async signOut(): Promise<void> {
    if (this.busy() !== null) return;
    this.error.set(null);
    this.busy.set('signing-out');
    this.status.set('Signing out…');
    try {
      await this.session.signOut();
      this.signedInEmail.set('');
      this.status.set('Signed out.');
      this.show('email');
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(null);
    }
  }

  /** Shows the step the session's current state calls for. */
  private showSessionStep(): void {
    const state = this.session.state();
    if (state.status === 'signed-in' && state.isAdmin) {
      void this.router.navigateByUrl('/admin');
      return;
    }
    if (state.status === 'signed-in') {
      this.signedInEmail.set(state.email);
      this.status.set('This account is not a maintainer.');
      this.show('denied');
      return;
    }
    this.status.set('');
    this.show('email');
  }

  /** Switches step and, once it has rendered, moves focus to its heading. */
  private show(step: SignInStep): void {
    this.step.set(step);
    afterNextRender(() => this.stepHeading()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** Records a failure for the alert; anything that is not an AdminAuthError counts as unknown. */
  private fail(error: unknown): void {
    this.error.set(
      error instanceof AdminAuthError
        ? error
        : new AdminAuthError('unknown', error),
    );
    this.status.set('');
  }

  /**
   * Starts the countdown that keeps "send a new code" locked for {@link RESEND_DELAY_S}. It ticks
   * outside the Angular zone so the running interval does not keep the app from reporting stable;
   * the signal write still schedules the re-render.
   */
  private startResendTimer(): void {
    this.stopResendTimer();
    this.resendIn.set(RESEND_DELAY_S);
    this.resendTimer = this.zone.runOutsideAngular(() =>
      setInterval(() => {
        const left = this.resendIn() - 1;
        this.resendIn.set(left);
        if (left <= 0) this.stopResendTimer();
      }, 1000),
    );
  }

  /** Stops the countdown, if one runs. */
  private stopResendTimer(): void {
    if (this.resendTimer !== null) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
  }
}
