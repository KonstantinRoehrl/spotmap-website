import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { CityEnum } from '../../../models/enums/map-enum';
import { AsciiAnimationTextComponent } from '../ascii-animation-text/ascii-animation-text.component';
import {
  fittingBannerLines,
  HEADER_BANNER_FONT_PX,
  RESTING_BANNER_LINE,
  TOPBAR_BANNER_FONT_PX,
} from './topbar-banner';

/** The banner's lines after the city's own; the house voice the map page has always cycled. */
const BANNER_LINES = [
  'RESPECT THE LOCALS',
  'EXPLORE THE CONCRETE JUNGLE',
  'TOUCH THE UNTOUCHED SPOTS',
  'CAN SOMEONE BRING WAX?',
  'LET`S GO PLAZA',
  'SKATEVIDEOS > INSTAGRAM',
  'SUPPORTED BY ROLLTROTTEL-VERBAND',
  'ANYONE HAS A PIN?',
  'JUST SOME RANDOM TEXT',
  'FOR EDUCATIONAL PURPOSES ONLY',
  'CONTINUOUSLY UPDATED',
];

/**
 * The map page's cycling banner. In the `header` row it plays the city's line and the house voice
 * at a set size, so the row's height never moves. In the phone `topbar` it starts from the resting
 * line and plays only the lines that fit its measured width.
 */
@Component({
  selector: 'app-map-banner',
  imports: [AsciiAnimationTextComponent],
  templateUrl: './map-banner.component.html',
  styleUrl: './map-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapBannerComponent {
  /** The city whose line opens the list. */
  readonly city = input.required<CityEnum>();

  /** Which bar the banner sits in. */
  readonly variant = input.required<'header' | 'topbar'>();

  /** The banner's own element: it spans the top bar's content width. */
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The banner's width, measured for the `topbar` variant only. 0 until measured. */
  private readonly measuredWidth = signal(0);

  /** The size the lines are set at. */
  protected readonly fontPx = computed(() =>
    this.variant() === 'topbar' ? TOPBAR_BANNER_FONT_PX : HEADER_BANNER_FONT_PX,
  );

  /**
   * The lines to play. `header`: the city's line and the house voice. `topbar`: the resting line
   * first, less every line wider than the banner; the resting line alone before the first
   * measurement, and should nothing fit.
   */
  protected readonly messages = computed(() => {
    const lines = [`${this.city().toUpperCase()} SPOTMAP`, ...BANNER_LINES];
    if (this.variant() === 'header') {
      return lines;
    }
    const width = this.measuredWidth();
    const fitting =
      width > 0
        ? fittingBannerLines([RESTING_BANNER_LINE, ...lines], width)
        : [];
    return fitting.length > 0 ? fitting : [RESTING_BANNER_LINE];
  });

  constructor() {
    effect((onCleanup) => {
      if (this.variant() !== 'topbar') {
        return;
      }
      const observer = new ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width;
        if (width !== undefined) {
          this.measuredWidth.set(width);
        }
      });
      observer.observe(this.host);
      onCleanup(() => observer.disconnect());
    });
  }
}
