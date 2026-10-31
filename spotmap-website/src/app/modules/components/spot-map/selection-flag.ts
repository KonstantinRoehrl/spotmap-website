import type { Map as MapLibreMap } from 'maplibre-gl';
import type { ScreenPoint } from '../../../models/map/map-camera';
import { photoPinFilter, SPOT_PHOTO_LAYER_ID } from './spot-layers';

/** How long the flag takes to rise out of its pin or dot, or to fall back: spec §7.2's ≈420 ms. */
export const FLAG_MOTION_MS = 420;

/** The flag's crossfade under reduced motion, and its copy's fade-out: `--dur-fade`. */
export const FLAG_FADE_MS = 200;

/**
 * How long a photo pin given back takes to fade in: MapLibre's symbol fade, its `fadeDuration`
 * default, which the map is built with.
 */
export const SYMBOL_FADE_MS = 300;

/**
 * The longest a flag stands on its photo pin waiting for MapLibre to take the pin away (a filter
 * change is laid out again off the main thread) before it rises anyway.
 */
export const FLAG_HANDOFF_TIMEOUT_MS = 250;

/** Where a flag stands when it is down: on the photo pin it stands in for, or in its dot. */
export type FlagRest = 'pin' | 'dot';

/**
 * What a flag is doing: `held` on its photo pin's shape until the map has taken the pin away,
 * `rising` out of its pin or dot (and then standing up), `raised` from the start (a map built on
 * the spot), `falling` back into its pin or dot (and then resting there while the pin fades back
 * in), `leaving` as it fades out over the pin given back.
 */
export type FlagPhase = 'held' | 'rising' | 'raised' | 'falling' | 'leaving';

/** The spot a flag flies for. */
export interface FlagSpot {
  /** The spot's id: the flag's key, and the photo pin it stands in for. */
  readonly id: string;
  /** Its cover's thumbnail URL, the photo the flag raises. */
  readonly photo: string;
  /** Whether it is demolished, whose photo pin has a dim frame and a dimmed photo. */
  readonly demolished: boolean;
  /** Where it stands, `[lng, lat]`. */
  readonly coordinates: [number, number];
}

/** One flag as the template draws it. */
export interface FlagView {
  /** The spot's id. */
  readonly id: string;
  /** The photo it raises. */
  readonly photo: string;
  /** Whether its spot is demolished. */
  readonly demolished: boolean;
  /** The pin's canvas x, in px. */
  readonly x: number;
  /** The pin's canvas y, in px. */
  readonly y: number;
  /** Where it rises from and falls back to. */
  readonly rest: FlagRest;
  /** What it is doing. */
  readonly phase: FlagPhase;
  /** Whether it crossfades instead of travelling (reduced motion, read when it went up). */
  readonly reduced: boolean;
}

/** How a selection is shown. */
export interface FlagOptions {
  /** Whether it rises: a selection the visitor made does, one a map was built with stands raised. */
  readonly animate: boolean;
  /** Whether motion is reduced, so the flag crossfades instead of travelling. */
  readonly reduced: boolean;
}

/** Runs `run` after `ms`; the component runs it outside the Angular zone. */
export type FlagScheduler = (
  run: () => void,
  ms: number,
) => ReturnType<typeof setTimeout>;

/** One flag, as this class tracks it. */
interface Flag {
  readonly spot: FlagSpot;
  readonly rest: FlagRest;
  readonly reduced: boolean;
  phase: FlagPhase;
  /** Whether its photo pin is back on the map: the filter no longer hides it. */
  pinGiven: boolean;
  /** The flag's pending step, if any. */
  timer?: ReturnType<typeof setTimeout>;
}

/** The phases of a flag that is up, or on its way up: the selection's own. */
const UP: ReadonlySet<FlagPhase> = new Set(['held', 'rising', 'raised']);

/**
 * The selected spot's photo flag on one map build: one object with the photo pin it grows out of.
 * The flag is drawn over the map by the component (MapLibre cannot transition a symbol's size per
 * feature). This class decides, for each flag, where it stands and what it is doing. It is also
 * the one owner of the photo layer's filter, because hiding and giving back a photo pin is the
 * hand-off. A flag stands on its pin's exact shape until the map has taken the pin away, and only
 * then rises. On release it falls back into the pin, gives the pin back, and keeps covering it
 * while MapLibre fades it in, so there is never a second copy or a gap. A spot whose photo pin was
 * not placed unfolds out of its dot. A flag falling back can share the map with the next one
 * rising. Timers and the render listener are released on dispose.
 */
export class SelectionFlag {
  /** The flags on the map, oldest first. */
  private flags: Flag[] = [];
  /** The flag standing on its pin until the map has taken the pin away, if any. */
  private waiting?: Flag;
  /** The ids the photo layer's filter hides now, joined, so an unchanged set sets no filter. */
  private hiddenKey = '';
  /** Lets the waiting flag rise once a rendered frame no longer shows its photo pin. */
  private readonly onRender = () => {
    const waiting = this.waiting;
    if (waiting && !this.photoPinShows(waiting.spot.id)) {
      this.rise(waiting);
    }
  };

  /**
   * @param map the build's map, its photo layer already added
   * @param onChange receives what to draw whenever it changes
   * @param schedule runs each step later; the component passes one outside the Angular zone
   */
  constructor(
    private readonly map: MapLibreMap,
    private readonly onChange: (views: readonly FlagView[]) => void,
    private readonly schedule: FlagScheduler = (run, ms) => setTimeout(run, ms),
  ) {}

  /**
   * Flies the flag for `spot`, lowering the one up for another spot; `null` lowers it. A spot
   * already flying is left alone.
   */
  show(spot: FlagSpot | null, options: FlagOptions): void {
    const up = this.flags.find((flag) => UP.has(flag.phase));
    if (up && up.spot.id === spot?.id) {
      return;
    }
    if (up) {
      this.lower(up);
    }
    if (spot) {
      this.raise(spot, options);
    }
    this.hidePins();
    this.emit();
  }

  /** Redraws every flag where the map now puts its spot: once a frame while the map moves. */
  reposition(): void {
    if (this.flags.length > 0) {
      this.emit();
    }
  }

  /** Stops every step and the render listener. Called before the map is removed. */
  dispose(): void {
    this.stopWaiting();
    for (const flag of this.flags) {
      clearTimeout(flag.timer);
    }
    this.flags = [];
  }

  /**
   * Puts a flag up for `spot`. One already falling for it is picked up where it stands. One on a
   * placed photo pin waits for the map to take the pin away. One out of a dot, or one picked up,
   * rises at once.
   */
  private raise(spot: FlagSpot, { animate, reduced }: FlagOptions): void {
    const earlier = this.flags.find((flag) => flag.spot.id === spot.id);
    if (earlier) {
      this.remove(earlier);
    }
    const pickedUp = earlier !== undefined && !earlier.pinGiven;
    const rest: FlagRest = pickedUp
      ? earlier.rest
      : this.photoPinShows(spot.id)
        ? 'pin'
        : 'dot';
    const flag: Flag = { spot, rest, reduced, phase: 'held', pinGiven: false };
    this.flags.push(flag);
    if (!animate) {
      flag.phase = 'raised';
    } else if (rest === 'dot' || pickedUp) {
      flag.phase = 'rising';
    } else {
      this.waiting = flag;
      this.map.on('render', this.onRender);
      flag.timer = this.schedule(
        () => this.rise(flag),
        FLAG_HANDOFF_TIMEOUT_MS,
      );
    }
  }

  /** Sends a held flag up, now that its photo pin is gone or the wait ran out. */
  private rise(flag: Flag): void {
    if (this.waiting === flag) {
      this.stopWaiting();
    }
    clearTimeout(flag.timer);
    flag.timer = undefined;
    flag.phase = 'rising';
    this.emit();
  }

  /** Lowers a flag: one that never left its pin just goes; any other falls back. */
  private lower(flag: Flag): void {
    if (this.waiting === flag) {
      this.stopWaiting();
    }
    clearTimeout(flag.timer);
    if (flag.phase === 'held') {
      this.remove(flag);
      return;
    }
    flag.phase = 'falling';
    flag.timer = this.schedule(
      () => this.landed(flag),
      flag.reduced ? FLAG_FADE_MS : FLAG_MOTION_MS,
    );
  }

  /**
   * A fall has ended: the photo pin is given back. A flag back in its dot goes; one back on its pin
   * stays over the pin while MapLibre fades it in, then fades out itself.
   */
  private landed(flag: Flag): void {
    flag.pinGiven = true;
    if (flag.rest === 'dot') {
      this.remove(flag);
    } else {
      flag.timer = this.schedule(() => this.leave(flag), SYMBOL_FADE_MS);
    }
    this.hidePins();
    this.emit();
  }

  /** Fades a landed flag's copy out over its photo pin, then drops it. */
  private leave(flag: Flag): void {
    flag.phase = 'leaving';
    flag.timer = this.schedule(() => {
      this.remove(flag);
      this.emit();
    }, FLAG_FADE_MS);
    this.emit();
  }

  /** Forgets a flag and its pending step. */
  private remove(flag: Flag): void {
    clearTimeout(flag.timer);
    this.flags = this.flags.filter((other) => other !== flag);
  }

  /** Hides the photo pin of every flag that has not given its pin back; only when that set changes. */
  private hidePins(): void {
    const hidden = this.flags
      .filter((flag) => !flag.pinGiven)
      .map((flag) => flag.spot.id);
    const key = hidden.join('\n');
    if (key === this.hiddenKey) {
      return;
    }
    this.hiddenKey = key;
    this.map.setFilter(SPOT_PHOTO_LAYER_ID, photoPinFilter(hidden));
  }

  /** Whether the map shows `id`'s photo pin on screen now. */
  private photoPinShows(id: string): boolean {
    return this.map
      .queryRenderedFeatures({ layers: [SPOT_PHOTO_LAYER_ID] })
      .some((feature) => feature.properties?.['id'] === id);
  }

  /** Stops waiting on rendered frames. */
  private stopWaiting(): void {
    if (this.waiting) {
      this.map.off('render', this.onRender);
      this.waiting = undefined;
    }
  }

  /** Hands the template every flag, each at its spot's canvas point now. */
  private emit(): void {
    this.onChange(
      this.flags.map((flag): FlagView => {
        const { x, y }: ScreenPoint = this.map.project(flag.spot.coordinates);
        return {
          id: flag.spot.id,
          photo: flag.spot.photo,
          demolished: flag.spot.demolished,
          x,
          y,
          rest: flag.rest,
          phase: flag.phase,
          reduced: flag.reduced,
        };
      }),
    );
  }
}
