import { WritableSignal, signal } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import {
  AdminAuthError,
  AdminSession,
  AdminSessionState,
} from '../../../../services/admin/admin-session';
import { AdminSignInComponent } from './admin-sign-in.component';

/** A hand-written AdminSession: `state` is writable so a test can play a sign-in. */
interface FakeSession {
  state: WritableSignal<AdminSessionState>;
  ready: jasmine.Spy<() => Promise<AdminSessionState>>;
  requestSignIn: jasmine.Spy<(email: string) => Promise<void>>;
  verifyCode: jasmine.Spy<(email: string, code: string) => Promise<void>>;
  signOut: jasmine.Spy<() => Promise<void>>;
}

const ADMIN: AdminSessionState = {
  status: 'signed-in',
  email: 'maintainer@example.org',
  isAdmin: true,
};

describe('AdminSignInComponent', () => {
  let session: FakeSession;
  let navigate: jasmine.Spy;
  let fixture: ComponentFixture<AdminSignInComponent>;

  function fakeSession(initial: AdminSessionState): FakeSession {
    const state = signal(initial);
    return {
      state,
      ready: jasmine.createSpy('ready').and.callFake(async () => state()),
      requestSignIn: jasmine.createSpy('requestSignIn').and.resolveTo(),
      verifyCode: jasmine
        .createSpy('verifyCode')
        .and.callFake(async () => state.set(ADMIN)),
      signOut: jasmine
        .createSpy('signOut')
        .and.callFake(async () =>
          state.set({ status: 'signed-out', linkError: null }),
        ),
    };
  }

  function setUp(initial: AdminSessionState): void {
    session = fakeSession(initial);
    TestBed.configureTestingModule({
      imports: [AdminSignInComponent],
      providers: [
        provideRouter([]),
        { provide: AdminSession, useValue: session },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(
      true,
    );
    fixture = TestBed.createComponent(AdminSignInComponent);
  }

  /** Lets the fake session's promises settle and renders the result. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const q = <T extends HTMLElement = HTMLElement>(testId: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<T>(
      `[data-testid="${testId}"]`,
    );

  function type(testId: string, value: string): void {
    const input = q<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function sendLink(email = 'maintainer@example.org'): Promise<void> {
    type('email-input', email);
    q('send-button')!.click();
    await settle();
  }

  it('asks a signed-out visitor for their email, with a labelled email field', async () => {
    setUp({ status: 'signed-out', linkError: null });
    await settle();
    expect(q('step-email')).withContext('email step').not.toBeNull();
    const input = q<HTMLInputElement>('email-input')!;
    expect(input.type).toBe('email');
    expect(input.autocomplete).toBe('email');
    expect(input.labels?.[0]?.textContent?.trim()).toBe('Email');
  });

  it('explains a failed sign-in link above the email field', async () => {
    setUp({ status: 'signed-out', linkError: 'invalid-code' });
    await settle();
    expect(q('link-error')).withContext('link error').not.toBeNull();
    expect(q('link-error')!.textContent).toContain('expired');
  });

  it('announces status through a polite live region', async () => {
    setUp({ status: 'signed-out', linkError: null });
    await settle();
    const status = q('sign-in-status')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('role')).toBe('status');
  });

  it('sends a signed-in admin straight on to the admin area', async () => {
    setUp(ADMIN);
    await settle();
    expect(navigate).toHaveBeenCalledOnceWith('/admin');
  });

  it('tells a signed-in non-admin the account is not a maintainer, and offers sign-out', async () => {
    setUp({
      status: 'signed-in',
      email: 'visitor@example.org',
      isAdmin: false,
    });
    await settle();
    expect(q('step-denied')).withContext('denied step').not.toBeNull();
    expect(q('step-denied')!.textContent).toContain('visitor@example.org');
    expect(q('step-denied')!.textContent).toContain('not a maintainer');

    q('sign-out-button')!.click();
    await settle();
    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(q('step-email'))
      .withContext('email step after sign-out')
      .not.toBeNull();
  });

  it('mails the link and code, then shows the code field', async () => {
    setUp({ status: 'signed-out', linkError: null });
    await settle();
    await sendLink();
    expect(session.requestSignIn).toHaveBeenCalledOnceWith(
      'maintainer@example.org',
    );
    expect(q('step-code')).withContext('code step').not.toBeNull();
    const code = q<HTMLInputElement>('code-input')!;
    expect(code.inputMode).toBe('numeric');
    expect(code.autocomplete).toBe('one-time-code');
    expect(code.maxLength).toBe(6);
    expect(q('sign-in-status')!.textContent).toContain(
      'maintainer@example.org',
    );
  });

  it('moves focus to the new step’s heading', async () => {
    setUp({ status: 'signed-out', linkError: null });
    await settle();
    await sendLink();
    expect(document.activeElement).toBe(q('step-code')!.querySelector('h1'));
  });

  it('keeps only digits in the code and signs in once all six are there', async () => {
    setUp({ status: 'signed-out', linkError: null });
    await settle();
    await sendLink();
    expect(q<HTMLButtonElement>('verify-button')!.disabled).toBeTrue();

    type('code-input', '12a3 456');
    expect(q<HTMLInputElement>('code-input')!.value).toBe('123456');
    expect(q<HTMLButtonElement>('verify-button')!.disabled).toBeFalse();

    q('verify-button')!.click();
    await settle();
    expect(session.verifyCode).toHaveBeenCalledOnceWith(
      'maintainer@example.org',
      '123456',
    );
    expect(navigate).toHaveBeenCalledOnceWith('/admin');
  });

  it('unlocks "send a new code" after 60 seconds', fakeAsync(() => {
    setUp({ status: 'signed-out', linkError: null });
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
    type('email-input', 'maintainer@example.org');
    q('send-button')!.click();
    flushMicrotasks();
    fixture.detectChanges();

    const resend = () => q<HTMLButtonElement>('resend-button')!;
    expect(resend().disabled).toBeTrue();
    expect(resend().textContent).toContain('60');
    tick(59_000);
    fixture.detectChanges();
    expect(resend().disabled).toBeTrue();
    tick(1_000);
    fixture.detectChanges();
    expect(resend().disabled).toBeFalse();

    resend().click();
    flushMicrotasks();
    expect(session.requestSignIn).toHaveBeenCalledTimes(2);
    tick(60_000);
  }));

  it('goes back to the email step to use another address', async () => {
    setUp({ status: 'signed-out', linkError: null });
    await settle();
    await sendLink();
    q('change-email-button')!.click();
    await settle();
    expect(q('step-email')).not.toBeNull();
  });

  it('shows a refused send as an alert tied to the email field', async () => {
    setUp({ status: 'signed-out', linkError: null });
    await settle();
    session.requestSignIn.and.rejectWith(new AdminAuthError('rate-limited'));
    await sendLink();
    const error = q('sign-in-error')!;
    expect(error).withContext('error').not.toBeNull();
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain(
      new AdminAuthError('rate-limited').message,
    );
    const input = q<HTMLInputElement>('email-input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(q('step-email'))
      .withContext('stays on the email step')
      .not.toBeNull();
  });

  it('shows a wrong code as an alert tied to the code field', async () => {
    setUp({ status: 'signed-out', linkError: null });
    await settle();
    await sendLink();
    session.verifyCode.and.rejectWith(new AdminAuthError('invalid-code'));
    type('code-input', '000000');
    q('verify-button')!.click();
    await settle();
    expect(q('sign-in-error')!.textContent).toContain(
      new AdminAuthError('invalid-code').message,
    );
    expect(q('code-input')!.getAttribute('aria-describedby')).toBe(
      'sign-in-error',
    );
  });

  it('shows why the session could not load, and still offers the email step', async () => {
    setUp({ status: 'loading' });
    session.ready.and.rejectWith(new AdminAuthError('network'));
    await settle();
    expect(q('step-email')).not.toBeNull();
    expect(q('sign-in-error')!.textContent).toContain(
      new AdminAuthError('network').message,
    );
  });
});
