import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

/** How the rain moves: falling, slowed once the spots are in, or stopped on a still frame. */
export type RainPace = 'run' | 'slow' | 'frozen';

/** One falling column: its trail top to bottom, the bright character that leads it, and its pace. */
interface RainColumn {
  readonly trail: string;
  readonly head: string;
  readonly durationMs: number;
  readonly offsetMs: number;
}

/**
 * The glyphs the rain is made of — the matrix loader's set, minus the look-alikes I/O. Shared with
 * the map loader's scrambling letters, so both read as one signal.
 */
export const RAIN_CHARACTERS = '01ABCDEFGHJKLMNPQRSTUVXYZ#$%&*+=<>?';

/** The playback rate of the slowed rain, relative to its own pace. */
const SLOW_PLAYBACK_RATE = 0.4;

/**
 * A field of falling ASCII characters, drawn as CSS sprites: each column is a fixed random strip
 * moved by `steps()` keyframes, so no timer and no change detection runs while it falls. Decoration
 * only — hidden from assistive technology.
 */
@Component({
  selector: 'app-ascii-rain',
  imports: [],
  templateUrl: './ascii-rain.component.html',
  styleUrl: './ascii-rain.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class.rain--frozen]': "pace() === 'frozen'",
    '[class.rain--fill]': 'fillWidth()',
    '[style.--rain-rows]': 'rows()',
  },
})
export class AsciiRainComponent {
  /** How many columns fall side by side. */
  columns = input(24);
  /** How many lines one fall covers; the host should be no taller than this many lines. */
  rows = input(20);
  /** Falling, slowed, or frozen on a still frame. */
  pace = input<RainPace>('run');
  /**
   * Cover the host's width instead of drawing `columns`: after the first render the column count
   * is measured from the host once, and `columns` stays only as the count until then.
   */
  fillWidth = input(false);

  /** The column count that covers the host, once measured; `null` until then and when not filling. */
  private readonly measuredColumns = signal<number | null>(null);

  /** The columns, generated once per instance and kept until their count changes. */
  protected readonly strips = computed(() =>
    Array.from({ length: this.measuredColumns() ?? this.columns() }, () =>
      randomColumn(this.rows()),
    ),
  );

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // Measured once: the host's width is the frame's, and a width read per frame or per resize
    // would cost the very JavaScript the CSS sprites avoid. A zero width (host not laid out) keeps
    // `columns`.
    afterNextRender(() => {
      if (!this.fillWidth()) {
        return;
      }
      const column = host.querySelector('.rain__column');
      const columnWidth = column?.getBoundingClientRect().width;
      if (columnWidth && host.clientWidth > 0) {
        this.measuredColumns.set(Math.ceil(host.clientWidth / columnWidth));
      }
    });
    // After render, so the CSS animations exist; the playback rate eases the fall rather than
    // restarting it, which rewriting `animation-duration` would. A still-pending animation (not
    // yet started, so nothing to jump) takes the rate at once: `updatePlaybackRate` would defer it
    // until the animation starts.
    afterRenderEffect(() => {
      this.strips(); // columns redrawn after measuring are new animations and need the rate too
      const rate = this.pace() === 'run' ? 1 : SLOW_PLAYBACK_RATE;
      for (const animation of host.getAnimations({ subtree: true })) {
        if (animation.pending) {
          animation.playbackRate = rate;
        } else {
          animation.updatePlaybackRate(rate);
        }
      }
    });
  }
}

/** A column two falls long, so the strip can slide one fall's height and still fill the column. */
function randomColumn(rows: number): RainColumn {
  let trail = '';
  for (let line = 0; line < rows * 2 - 1; line++) {
    trail += randomCharacter() + '\n';
  }
  return {
    trail,
    head: randomCharacter(),
    durationMs: Math.round(rows * (45 + Math.random() * 60)),
    offsetMs: -Math.round(Math.random() * 2000),
  };
}

/** One random glyph from {@link RAIN_CHARACTERS}. */
function randomCharacter(): string {
  return RAIN_CHARACTERS[Math.floor(Math.random() * RAIN_CHARACTERS.length)];
}
