import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import {
  AdminAuthError,
  AdminSession,
  AdminSessionState,
} from '../../../../services/admin/admin-session';
import { AdminShellComponent } from './admin-shell.component';

/** Stands in for the child pages Tasks 14 and 15 add. */
@Component({ template: '<p data-testid="child-page">child</p>' })
class ChildPageComponent {}

describe('AdminShellComponent', () => {
  const signOut = jasmine.createSpy('signOut');

  beforeEach(async () => {
    signOut.calls.reset();
    signOut.and.resolveTo();
    const state = signal<AdminSessionState>({
      status: 'signed-in',
      email: 'maintainer@example.org',
      isAdmin: true,
    });
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'admin',
            component: AdminShellComponent,
            children: [
              { path: 'add', component: ChildPageComponent },
              { path: 'spots', component: ChildPageComponent },
            ],
          },
          { path: 'admin/sign-in', component: ChildPageComponent },
        ]),
        {
          provide: AdminSession,
          useValue: { state: state.asReadonly(), signOut },
        },
      ],
    }).compileComponents();
  });

  /** Navigates the real router into the shell and returns the rendered page root. */
  async function open(url = '/admin/add'): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(AdminShellComponent);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const q = (root: HTMLElement, testId: string) =>
    root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

  it('links the Add and Spots sections in a labelled nav', async () => {
    const root = await open();
    const nav = root.querySelector('nav')!;
    expect(nav).withContext('nav').not.toBeNull();
    expect(nav.getAttribute('aria-label')).toBe('Maintainer sections');
    expect(q(root, 'nav-add')!.getAttribute('href')).toBe('/admin/add');
    expect(q(root, 'nav-spots')!.getAttribute('href')).toBe('/admin/spots');
  });

  it('marks the current section', async () => {
    const root = await open('/admin/add');
    expect(q(root, 'nav-add')!.classList).toContain('active');
    expect(q(root, 'nav-add')!.getAttribute('aria-current')).toBe('page');
    expect(q(root, 'nav-spots')!.classList).not.toContain('active');
  });

  it('shows the signed-in email', async () => {
    const root = await open();
    expect(q(root, 'signed-in-email')!.textContent?.trim()).toBe(
      'maintainer@example.org',
    );
  });

  it('signs out and returns to the sign-in page', async () => {
    const root = await open();
    q(root, 'sign-out-button')!.click();
    await new Promise<void>((resolve) => setTimeout(resolve));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe('/admin/sign-in');
  });

  it('stays and says why when signing out fails', async () => {
    signOut.and.rejectWith(new AdminAuthError('network'));
    const fixture = TestBed.createComponent(AdminShellComponent);
    await TestBed.inject(Router).navigateByUrl('/admin/add');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    q(root, 'sign-out-button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q(root, 'shell-error')!.textContent).toContain(
      new AdminAuthError('network').message,
    );
    expect(q(root, 'shell-error')!.getAttribute('role')).toBe('alert');
    expect(TestBed.inject(Router).url).toBe('/admin/add');
  });

  it('announces status through a polite live region', async () => {
    const root = await open();
    expect(q(root, 'shell-status')!.getAttribute('aria-live')).toBe('polite');
  });
});
