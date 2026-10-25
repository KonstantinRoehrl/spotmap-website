import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';

import { SHARE_NAVIGATOR, ShareNavigator } from '../spot-detail/share-spot';
import { SHARE_FEEDBACK_MS, SpotShareComponent } from './spot-share.component';

/** A navigator with no share sheet whose clipboard answers with `writeText`. */
function copyOnly(writeText: jasmine.Spy): ShareNavigator {
  return { clipboard: { writeText } } as unknown as ShareNavigator;
}

/** A navigator with a share sheet that accepts every link, and a clipboard. */
function withSheet(share: jasmine.Spy, writeText: jasmine.Spy): ShareNavigator {
  return {
    share,
    canShare: () => true,
    clipboard: { writeText },
  } as unknown as ShareNavigator;
}

describe('SpotShareComponent', () => {
  let fixture: ComponentFixture<SpotShareComponent>;
  let writeText: jasmine.Spy;
  let share: jasmine.Spy;

  beforeEach(() => {
    writeText = jasmine.createSpy('writeText').and.resolveTo();
    share = jasmine.createSpy('share').and.resolveTo();
  });

  afterEach(() => fixture?.destroy());

  function create(
    nav: ShareNavigator = copyOnly(writeText),
    { animations = false }: { animations?: boolean } = {},
  ): HTMLElement {
    TestBed.configureTestingModule({
      animationsEnabled: animations,
      imports: [SpotShareComponent],
      providers: [{ provide: SHARE_NAVIGATOR, useValue: nav }],
    });
    fixture = TestBed.createComponent(SpotShareComponent);
    fixture.componentRef.setInput('spotId', 'a-1');
    fixture.componentRef.setInput('spotName', 'Alpha Bank');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const trigger = () =>
    host().querySelector<HTMLButtonElement>('.spot-share__trigger')!;
  /** The label the visitor reads: labels on their way out are not counted. */
  const shownLabel = () =>
    Array.from(
      host().querySelectorAll(
        '.spot-share__label-text:not(.spot-share__label-text--leaving)',
      ),
    )
      .map((element) => (element.textContent ?? '').trim())
      .join('');
  /** The menu while it is open; one fading out after a close is not counted. */
  const menu = () =>
    host().querySelector<HTMLElement>(
      '.spot-share__menu:not(.spot-share__menu--leaving)',
    );
  const items = () =>
    Array.from(
      menu()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
  const status = () => host().querySelector<HTMLElement>('[role="status"]')!;

  /** Renders, lets promises settle and runs the render hooks that move focus and place the menu. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    fixture.detectChanges();
  }

  function press(target: Element, key: string, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  describe('where there is no share sheet', () => {
    it('is a COPY LINK plate, not a menu button', () => {
      create();
      expect(shownLabel()).toBe('> COPY LINK');
      expect(trigger().getAttribute('aria-label')).toBe(
        'Copy link: Alpha Bank',
      );
      expect(trigger().hasAttribute('aria-haspopup')).toBeFalse();
      expect(trigger().hasAttribute('aria-expanded')).toBeFalse();
    });

    it('copies the link and says so in its own label, politely', async () => {
      create();
      expect(status().getAttribute('aria-live')).toBe('polite');
      expect(status().textContent!.trim()).toBe('');
      trigger().click();
      await settle();
      expect(writeText).toHaveBeenCalledOnceWith(
        jasmine.stringMatching(/\/spot\/a-1$/),
      );
      expect(shownLabel()).toBe('> LINK COPIED');
      expect(status().textContent!.trim()).toBe('Link copied');
      expect(menu()).toBeNull();
    });

    it('says so when the copy is refused', async () => {
      writeText.and.rejectWith(new DOMException('denied', 'NotAllowedError'));
      create();
      trigger().click();
      await settle();
      expect(shownLabel()).toBe('> COPY FAILED');
      expect(status().textContent!.trim()).toBe(
        'Copy failed. The link was not copied.',
      );
    });

    it('crossfades back to its own label after a few seconds', fakeAsync(() => {
      create();
      trigger().click();
      flushMicrotasks();
      fixture.detectChanges();
      expect(shownLabel()).toBe('> LINK COPIED');
      tick(SHARE_FEEDBACK_MS - 1);
      fixture.detectChanges();
      expect(shownLabel()).toBe('> LINK COPIED');
      tick(1);
      fixture.detectChanges();
      expect(shownLabel()).toBe('> COPY LINK');
      expect(status().textContent!.trim()).toBe('');
      expect(SHARE_FEEDBACK_MS).toBe(3000);
    }));

    it('cancels a pending feedback timer when it is destroyed', fakeAsync(() => {
      create();
      trigger().click();
      flushMicrotasks();
      fixture.destroy();
      // fakeAsync fails the spec on a timer still queued here: destroy must have cleared it.
      expect(fixture.componentRef.hostView.destroyed).toBeTrue();
    }));

    it('drops the feedback when another spot is handed to it', async () => {
      create();
      trigger().click();
      await settle();
      expect(shownLabel()).toBe('> LINK COPIED');
      fixture.componentRef.setInput('spotId', 'b-2');
      fixture.componentRef.setInput('spotName', 'Beta Ledge');
      await settle();
      expect(shownLabel()).toBe('> COPY LINK');
      expect(trigger().getAttribute('aria-label')).toBe(
        'Copy link: Beta Ledge',
      );
    });
  });

  describe('where there is a share sheet', () => {
    it('is a SHARE SPOT menu button, closed at first', () => {
      create(withSheet(share, writeText));
      expect(shownLabel()).toBe('> SHARE SPOT ▾');
      // The visible words SHARE SPOT lead the name, so voice control and screen readers agree.
      expect(trigger().getAttribute('aria-label')).toBe(
        'Share spot: Alpha Bank',
      );
      expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      expect(menu()).toBeNull();
    });

    it('opens a menu of COPY LINK and SHARE VIA… with focus on the first', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      expect(menu()!.getAttribute('role')).toBe('menu');
      expect(menu()!.getAttribute('aria-labelledby')).toBe(trigger().id);
      expect(trigger().getAttribute('aria-controls')).toBe(menu()!.id);
      expect(items().map((item) => (item.textContent ?? '').trim())).toEqual([
        '> COPY LINK',
        '> SHARE VIA…',
      ]);
      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual([
        'Copy link',
        'Share via…',
      ]);
      expect(items().map((item) => item.tabIndex)).toEqual([-1, -1]);
      expect(document.activeElement).toBe(items()[0]);
    });

    it('moves between the items with the arrow keys, Home and End', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      const [copy, via] = items();
      expect(press(copy, 'ArrowDown').defaultPrevented).toBeTrue();
      expect(document.activeElement).toBe(via);
      press(via, 'ArrowDown');
      expect(document.activeElement).toBe(copy);
      press(copy, 'ArrowUp');
      expect(document.activeElement).toBe(via);
      press(via, 'Home');
      expect(document.activeElement).toBe(copy);
      press(copy, 'End');
      expect(document.activeElement).toBe(via);
    });

    it('opens from the keyboard onto the first or the last item', async () => {
      create(withSheet(share, writeText));
      expect(press(trigger(), 'ArrowDown').defaultPrevented).toBeTrue();
      await settle();
      expect(document.activeElement).toBe(items()[0]);
      press(items()[0], 'Escape');
      await settle();
      press(trigger(), 'ArrowUp');
      await settle();
      expect(document.activeElement).toBe(items()[1]);
    });

    it('closes on Escape and hands focus back to the trigger', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      press(items()[0], 'Escape');
      await settle();
      expect(menu()).toBeNull();
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger());
    });

    it('closes on Tab without keeping the focus', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      expect(press(items()[0], 'Tab').defaultPrevented).toBeFalse();
      await settle();
      expect(menu()).toBeNull();
    });

    it('closes on a press outside it, but not on one inside', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      items()[1].dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      );
      fixture.detectChanges();
      expect(menu()).not.toBeNull();
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      );
      await settle();
      expect(menu()).toBeNull();
    });

    it('toggles closed from the trigger', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      trigger().click();
      await settle();
      expect(menu()).toBeNull();
    });

    it('copies from COPY LINK, closes, and shows the feedback on the trigger', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      items()[0].click();
      await settle();
      expect(writeText).toHaveBeenCalledOnceWith(
        jasmine.stringMatching(/\/spot\/a-1$/),
      );
      expect(share).not.toHaveBeenCalled();
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(trigger());
      expect(shownLabel()).toBe('> LINK COPIED');
      expect(status().textContent!.trim()).toBe('Link copied');
    });

    it('hands the link and the name to the share sheet from SHARE VIA…, with no feedback', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      items()[1].click();
      await settle();
      expect(share).toHaveBeenCalledOnceWith({
        url: jasmine.stringMatching(/\/spot\/a-1$/),
        title: 'Alpha Bank',
      });
      expect(writeText).not.toHaveBeenCalled();
      expect(menu()).toBeNull();
      expect(shownLabel()).toBe('> SHARE SPOT ▾');
    });

    it('copies instead when the share sheet fails for another reason than a dismissal', async () => {
      share.and.rejectWith(new DOMException('blocked', 'NotAllowedError'));
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      items()[1].click();
      await settle();
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(shownLabel()).toBe('> LINK COPIED');
    });

    it('says nothing when the visitor dismisses the share sheet', async () => {
      share.and.rejectWith(new DOMException('dismissed', 'AbortError'));
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      items()[1].click();
      await settle();
      expect(writeText).not.toHaveBeenCalled();
      expect(shownLabel()).toBe('> SHARE SPOT ▾');
      expect(status().textContent!.trim()).toBe('');
    });

    it('closes an open menu when another spot is handed to it', async () => {
      create(withSheet(share, writeText));
      trigger().click();
      await settle();
      fixture.componentRef.setInput('spotId', 'b-2');
      await settle();
      expect(menu()).toBeNull();
    });

    it('opens below the trigger when there is room, above it when there is not', async () => {
      const page = create(withSheet(share, writeText));
      page.style.cssText = 'position:fixed;left:16px;top:16px';
      trigger().click();
      await settle();
      expect(menu()!.classList).not.toContain('spot-share__menu--above');
      expect(menu()!.getBoundingClientRect().top).toBeGreaterThan(
        trigger().getBoundingClientRect().bottom,
      );
      press(items()[0], 'Escape');
      await settle();
      page.style.cssText = `position:fixed;left:16px;top:${window.innerHeight - 60}px`;
      trigger().click();
      await settle();
      expect(menu()!.classList).toContain('spot-share__menu--above');
      expect(menu()!.getBoundingClientRect().bottom).toBeLessThan(
        trigger().getBoundingClientRect().top,
      );
    });

    it('fades and rises in, and fades out on close instead of cutting', async () => {
      create(withSheet(share, writeText), { animations: true });
      trigger().click();
      await settle();
      const opened = menu()!;
      const style = getComputedStyle(opened);
      expect(style.transitionProperty).toContain('opacity');
      expect(style.transitionProperty).toContain('translate');
      expect(style.transitionDuration).toContain('0.2s');
      press(items()[0], 'Escape');
      fixture.detectChanges();
      // Still in the page, on its way out.
      expect(opened.isConnected).toBeTrue();
      expect(opened.classList).toContain('spot-share__menu--leaving');
    });
  });

  it('is a thumb-sized plate with the pointer bloom that never resizes as its label changes', async () => {
    create();
    const button = trigger();
    expect(button.classList).toContain('phosphor-bloom');
    expect(button.classList).toContain('phosphor-bloom--plate');
    expect(button.offsetHeight).toBeGreaterThanOrEqual(44);
    const width = button.getBoundingClientRect().width;
    button.click();
    await settle();
    expect(shownLabel()).toBe('> LINK COPIED');
    expect(button.getBoundingClientRect().width).toBe(width);
  });

  it('crossfades its label in one cell', () => {
    create();
    const label = host().querySelector('.spot-share__label')!;
    expect(getComputedStyle(label).display).toBe('grid');
    const text = getComputedStyle(
      host().querySelector('.spot-share__label-text')!,
    );
    expect(text.transitionProperty).toContain('opacity');
  });

  it('sets no text below 12 px', async () => {
    create(withSheet(share, writeText));
    trigger().click();
    await settle();
    for (const element of Array.from(host().querySelectorAll('*'))) {
      if ((element.textContent ?? '').trim() === '') {
        continue;
      }
      expect(parseFloat(getComputedStyle(element).fontSize))
        .withContext(element.className)
        .toBeGreaterThanOrEqual(12);
    }
  });
});
