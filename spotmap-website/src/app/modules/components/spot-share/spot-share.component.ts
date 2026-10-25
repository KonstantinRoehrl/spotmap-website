import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  NgZone,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';
import {
  copySpotLink,
  hasShareSheet,
  SHARE_NAVIGATOR,
  shareSpot,
  spotLink,
} from '../spot-detail/share-spot';
import {
  MENU_GAP_PX,
  type MenuPlacement,
  menuPlacement,
  type VerticalBand,
} from './menu-placement';

/** How long the share control's own label shows `> LINK COPIED` / `> COPY FAILED` before it crossfades back. */
export const SHARE_FEEDBACK_MS = 3000;

/** What a copy came to, as the trigger's label reports it. */
type ShareFeedback = 'copied' | 'copy-failed';

/** Numbers each control's trigger and menu, so the menu's label always finds its own trigger. */
let nextShareId = 0;

/**
 * The part of the screen an element's popup may cover: the box of its nearest ancestor that clips
 * vertically (a scroller, or hidden overflow — the detail's pane, the sheet), clipped to the
 * viewport; the viewport alone when nothing clips.
 */
function visibleBand(element: HTMLElement): VerticalBand {
  const view = element.ownerDocument.defaultView!;
  let top = 0;
  let bottom = view.innerHeight;
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (
      ['auto', 'scroll', 'hidden', 'clip'].includes(
        view.getComputedStyle(ancestor).overflowY,
      )
    ) {
      const box = ancestor.getBoundingClientRect();
      top = Math.max(top, box.top);
      bottom = Math.min(bottom, box.bottom);
      break;
    }
  }
  return { top, bottom };
}

/**
 * A spot's share control, one 44 px plate. Where the browser offers a share sheet it is
 * `> SHARE SPOT ▾`, a menu button (WAI-ARIA APG) whose small menu holds `> COPY LINK` and
 * `> SHARE VIA…`. Elsewhere that menu would hold one entry, so the plate is `> COPY LINK` itself.
 *
 * A copy, or a refused one, is reported by the trigger's own label, which crossfades to
 * `> LINK COPIED` / `> COPY FAILED` for {@link SHARE_FEEDBACK_MS}, and is read out by a polite live
 * region that is in place from the start. `> SHARE VIA…` keeps the share sheet's fallback: a sheet
 * that fails other than by the visitor dismissing it copies the link instead (`shareSpot`).
 *
 * The menu is built here rather than with the CDK menu, whose overlay detaches at once and so
 * could not fade out. It opens below or above the trigger, whichever fits inside the part of the
 * screen the control's clipping ancestor shows, fading and rising 4 px in and fading out.
 */
@Component({
  selector: 'app-spot-share',
  imports: [PointerBloomDirective],
  templateUrl: './spot-share.component.html',
  styleUrl: './spot-share.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class SpotShareComponent {
  /** The spot whose link `spotLink(spotId)` is shared or copied. */
  readonly spotId = input.required<string>();
  /** The spot's name: the share sheet's title and part of the controls' accessible names. */
  readonly spotName = input.required<string>();

  /** The navigator the copy and the share sheet go through; a fake in specs. */
  private readonly nav = inject(SHARE_NAVIGATOR);
  /** Runs the feedback's clear timer outside the zone, see {@link showFeedback}. */
  private readonly zone = inject(NgZone);
  /** Lets the render hook that places the menu be registered from an event handler. */
  private readonly injector = inject(Injector);
  /** The control's own element: a press outside it closes the menu. */
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The trigger's id, which labels the menu. */
  protected readonly triggerId = `spot-share-trigger-${nextShareId}`;
  /** The menu's id, which the trigger controls. */
  protected readonly menuId = `spot-share-menu-${nextShareId++}`;

  /** The trigger, which takes focus back when the menu closes by a key or a choice. */
  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  /** The open menu, measured to choose its side. */
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  /** The menu's items, in order, for the arrow keys. */
  private readonly items = viewChildren<ElementRef<HTMLButtonElement>>('item');

  /** The spot's absolute link. */
  private readonly link = computed(() => spotLink(this.spotId()));

  /** Whether the browser offers a share sheet for this spot, which makes the control a menu. */
  protected readonly withSheet = computed(() =>
    hasShareSheet(this.nav, { url: this.link(), title: this.spotName() }),
  );

  /** Whether the menu is open. */
  protected readonly menuOpen = signal(false);
  /** Which side of the trigger the open menu sits on. */
  protected readonly placement = signal<MenuPlacement>('below');
  /** What the last copy came to, while its label shows; `null` otherwise. */
  private readonly feedback = signal<ShareFeedback | null>(null);

  /** The trigger's own label when it is not reporting a copy. */
  private readonly restingLabel = computed(() =>
    this.withSheet() ? '> SHARE SPOT ▾' : '> COPY LINK',
  );

  /** Every label the trigger can show; all sit invisibly in its one cell, so it never resizes. */
  protected readonly labels = computed(() => [
    this.restingLabel(),
    '> LINK COPIED',
    '> COPY FAILED',
  ]);

  /**
   * The label on show, as a list of one so the template can key it by its text and crossfade a
   * change. It is wrapped rather than a bare string because Angular warns (NG0956) whenever a list
   * tracked by item identity is recreated whole, which is exactly what this crossfade wants.
   */
  protected readonly shownLabel = computed(() => {
    const feedback = this.feedback();
    return [
      {
        text:
          feedback === 'copied'
            ? '> LINK COPIED'
            : feedback === 'copy-failed'
              ? '> COPY FAILED'
              : this.restingLabel(),
      },
    ];
  });

  /** The trigger's name: its visible words first, then the spot. */
  protected readonly triggerName = computed(
    () =>
      `${this.withSheet() ? 'Share spot' : 'Copy link'}: ${this.spotName()}`,
  );

  /** What the live region reads: plain words for a copy's outcome, nothing otherwise. */
  protected readonly announcement = computed(() => {
    const feedback = this.feedback();
    if (feedback === 'copied') {
      return 'Link copied';
    }
    return feedback === 'copy-failed'
      ? 'Copy failed. The link was not copied.'
      : '';
  });

  /** The pending timer that ends {@link feedback}. */
  private feedbackTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearFeedback());

    // Another spot starts with its own label and a closed menu.
    effect(() => {
      this.spotId();
      untracked(() => {
        this.clearFeedback();
        this.menuOpen.set(false);
      });
    });
  }

  /** The trigger: opens or closes the menu, or, without a share sheet, copies at once. */
  protected onTrigger(): void {
    if (!this.withSheet()) {
      void this.copy();
      return;
    }
    if (this.menuOpen()) {
      this.closeMenu(true);
    } else {
      this.openMenu('first');
    }
  }

  /** ↓ and ↑ on the trigger open the menu onto its first or last item (APG menu button). */
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (
      !this.withSheet() ||
      (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
    ) {
      return;
    }
    event.preventDefault();
    this.openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
  }

  /**
   * Keys inside the open menu: ↓ ↑ move through the items and wrap, Home and End go to the ends,
   * Escape closes it and returns focus to the trigger, Tab closes it and lets focus move on.
   */
  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this.items().map((item) => item.nativeElement);
    const current = items.indexOf(
      this.host.ownerDocument.activeElement as HTMLButtonElement,
    );
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (current + 1) % items.length;
        break;
      case 'ArrowUp':
        next = current <= 0 ? items.length - 1 : current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Escape':
        event.preventDefault();
        this.closeMenu(true);
        return;
      case 'Tab':
        this.closeMenu(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  /** A press anywhere outside the control closes the menu, leaving focus where the press put it. */
  protected onDocumentPointerDown(event: Event): void {
    if (
      this.menuOpen() &&
      !(event.target instanceof Node && this.host.contains(event.target))
    ) {
      this.closeMenu(false);
    }
  }

  /** `> COPY LINK`, from the menu: closes it, then copies. */
  protected onCopyItem(): void {
    this.closeMenu(true);
    void this.copy();
  }

  /** `> SHARE VIA…`: closes the menu and hands the link to the share sheet, copying if that fails. */
  protected async onShareItem(): Promise<void> {
    this.closeMenu(true);
    this.clearFeedback();
    const outcome = await shareSpot(this.link(), this.spotName(), this.nav);
    if (outcome === 'copied' || outcome === 'copy-failed') {
      this.showFeedback(outcome);
    }
  }

  /**
   * Opens the menu and, once it is drawn, sets it on the side where it fits and focuses its
   * `focus` item. It is measured rendered, since its height comes from its own styles.
   */
  private openMenu(focus: 'first' | 'last'): void {
    this.menuOpen.set(true);
    afterNextRender(
      () => {
        const menu = this.menu()?.nativeElement;
        if (!menu) {
          return;
        }
        this.placement.set(
          menuPlacement(
            this.trigger().nativeElement.getBoundingClientRect(),
            visibleBand(this.host),
            menu.offsetHeight,
            MENU_GAP_PX,
          ),
        );
        const items = this.items();
        items[focus === 'first' ? 0 : items.length - 1]?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  /** Closes the menu; `returnFocus` puts focus back on the trigger. */
  private closeMenu(returnFocus: boolean): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    if (returnFocus) {
      this.trigger().nativeElement.focus();
    }
  }

  /** Copies the spot's link and reports the outcome on the trigger. */
  private async copy(): Promise<void> {
    this.clearFeedback();
    this.showFeedback(await copySpotLink(this.link(), this.nav));
  }

  /**
   * Shows `outcome` on the trigger for {@link SHARE_FEEDBACK_MS}. The clear timer runs outside the
   * Angular zone so the waiting label does not keep the app from reporting stable; the signal
   * write still schedules the re-render.
   */
  private showFeedback(outcome: ShareFeedback): void {
    this.clearFeedback();
    this.feedback.set(outcome);
    this.feedbackTimer = this.zone.runOutsideAngular(() =>
      setTimeout(() => {
        this.feedbackTimer = undefined;
        this.feedback.set(null);
      }, SHARE_FEEDBACK_MS),
    );
  }

  /** Drops the feedback and its pending timer. */
  private clearFeedback(): void {
    if (this.feedbackTimer !== undefined) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = undefined;
    }
    this.feedback.set(null);
  }
}
