import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import {
  AdminAuthError,
  AdminSession,
  AdminSessionState,
} from '../../../../services/admin/admin-session';
import { ADMIN_ROUTES } from '../admin.routes';
import { AdminShellComponent } from './admin-shell.component';

/** Stands in for the child pages Tasks 14 and 15 add. */
@Component({ template: '<p data-testid="child-page">child</p>' })
class ChildPageComponent {}

/** Stands in for a page that brings its own `h1`, as the spot list and the edit page do. */
@Component({ template: '<h1 data-testid="page-heading">Spots</h1>' })
class HeadedPageComponent {}

/** The title the shell module read when it loaded; no spec has run yet, so no route has set one. */
const TITLE_AT_LOAD = document.title;

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
              { path: 'spots', component: HeadedPageComponent },
              {
                path: 'plain',
                title: 'Plain · Spotmap admin',
                component: ChildPageComponent,
              },
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

  it('restores the document title from before the admin area when the shell is destroyed', async () => {
    const title = TestBed.inject(Title);
    const fixture = TestBed.createComponent(AdminShellComponent);
    await TestBed.inject(Router).navigateByUrl('/admin/plain');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(title.getTitle()).toBe('Plain · Spotmap admin');
    fixture.destroy();
    expect(title.getTitle()).toBe(TITLE_AT_LOAD);
  });

  describe('on each navigation', () => {
    let harness: RouterTestingHarness | undefined;

    beforeEach(() => (harness = undefined));

    /** Navigates through the real router outlet and lets the focus move render. */
    async function go(url: string): Promise<HTMLElement> {
      const routed = (harness ??= await RouterTestingHarness.create());
      await routed.navigateByUrl(url);
      await routed.fixture.whenStable();
      routed.detectChanges();
      await routed.fixture.whenStable();
      return routed.routeNativeElement as HTMLElement;
    }

    it('gives the Add page an h1 and moves focus to it', async () => {
      const root = await go('/admin/add');
      const heading = q(root, 'add-heading')!;
      expect(heading.tagName).toBe('H1');
      expect(heading.textContent).toContain('Add');
      expect(document.activeElement).toBe(heading);
    });

    it('moves focus to the heading of the page navigated to', async () => {
      await go('/admin/add');
      const root = await go('/admin/spots');
      expect(document.activeElement).toBe(q(root, 'page-heading'));
      expect(q(root, 'add-heading')).toBeNull();
    });

    it('moves focus to the main region when the page has no heading', async () => {
      const root = await go('/admin/plain');
      expect(document.activeElement).toBe(root.querySelector('main'));
    });
  });

  it('gives every routed admin page a title, so each navigation is announced', () => {
    const shell = ADMIN_ROUTES.find((route) => route.component !== undefined)!;
    const pages = [
      ...ADMIN_ROUTES.filter((route) => route !== shell),
      ...shell.children!.filter((route) => route.redirectTo === undefined),
    ];
    expect(pages.length).toBe(4);
    for (const page of pages) {
      expect(page.title)
        .withContext(`title of /admin/${page.path}`)
        .toEqual(jasmine.any(String));
      expect(page.title).not.toBe('');
    }
  });
});
