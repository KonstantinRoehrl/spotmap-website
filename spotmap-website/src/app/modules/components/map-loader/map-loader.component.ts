import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  AsciiRainComponent,
  RainPace,
} from '../ascii-rain/ascii-rain.component';
import {
  lockedLetterCount,
  MapLoadState,
  MapLoadStep,
} from '../map-container/map-load-progress';

/** The steps in the order a load passes through them. */
const STEP_ORDER: readonly MapLoadStep[] = ['spots', 'map', 'draw', 'done'];

/** The glyphs a letter cell scrambles through — the rain's set, so both read as one signal. */
const SCRAMBLE_CHARACTERS = '01ABCDEFGHJKLMNPQRSTUVXYZ#$%&*+=<>?';

/** Lines in one scramble strip: the 12 `steps()` frames plus the line the strip comes to rest on. */
const SCRAMBLE_LINES = 13;

/**
 * The map's loading screen: the city's name decoding letter by letter over falling ASCII rain, a
 * step bar showing the real load progress, and the SPOTS · MAP · DRAW steps beneath it. All motion
 * is CSS; the component only maps the load state onto classes and widths. Decoration only — hidden
 * from assistive technology, which the map container's status region informs instead.
 */
@Component({
  selector: 'app-map-loader',
  imports: [AsciiRainComponent],
  templateUrl: './map-loader.component.html',
  styleUrl: './map-loader.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class MapLoaderComponent {
  /** The city slug; shown uppercase. */
  city = input.required<string>();
  /** Where the load is: its step, its progress and whether the snapshot is in use. */
  state = input.required<MapLoadState>();
  /** The bar's ease to 100 % has ended; emitted once per instance. */
  finished = output<void>();

  /** The letter cells: each letter with its own scramble strip, generated per city. */
  protected readonly cells = computed(() =>
    Array.from(this.city().toUpperCase(), (letter) => ({
      letter,
      strip: scrambleStrip(),
      durationMs: 700 + Math.round(Math.random() * 500),
      offsetMs: -Math.round(Math.random() * 900),
    })),
  );
  /** How many letters, from the left, have stopped scrambling. */
  protected readonly lockedCount = computed(() =>
    lockedLetterCount(this.city(), this.state().progress),
  );
  /** The labelled steps under the bar. */
  protected readonly steps = [
    { step: 'spots', label: 'SPOTS' },
    { step: 'map', label: 'MAP' },
    { step: 'draw', label: 'DRAW' },
  ] as const;

  /** `pending`, `current` or `done` for one labelled step, from the step the load is on. */
  protected stepState(step: MapLoadStep): 'pending' | 'current' | 'done' {
    const at = STEP_ORDER.indexOf(this.state().step);
    const index = STEP_ORDER.indexOf(step);
    return index < at ? 'done' : index === at ? 'current' : 'pending';
  }

  /** The rain falls while the spots load, slows once they are in, and freezes at DRAW. */
  protected readonly rainPace = computed<RainPace>(() => {
    const step = this.state().step;
    return step === 'spots' ? 'run' : step === 'map' ? 'slow' : 'frozen';
  });

  private finishedReported = false;

  /** The fill's width ease has ended; at 100 % that is the cue to reveal the map, reported once. */
  protected onFillTransitionEnd(event: TransitionEvent): void {
    if (
      event.propertyName !== 'width' ||
      this.state().progress < 1 ||
      this.finishedReported
    ) {
      return;
    }
    this.finishedReported = true;
    this.finished.emit();
  }
}

/** A column of random glyphs, one per line, for a letter cell to scramble through. */
function scrambleStrip(): string {
  return Array.from(
    { length: SCRAMBLE_LINES },
    () =>
      SCRAMBLE_CHARACTERS[
        Math.floor(Math.random() * SCRAMBLE_CHARACTERS.length)
      ],
  ).join('\n');
}
