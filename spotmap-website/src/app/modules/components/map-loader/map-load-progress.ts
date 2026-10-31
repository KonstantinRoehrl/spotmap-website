/**
 * The map loader's model: typed loading events in, one monotonic progress value out. Every advance
 * is caused by a real event (spec guideline 4); nothing here knows about time.
 */

import type { MapLoadEvent } from '../../../models/map/map-load-event';

/** The labelled steps the loader shows, plus `done` once the pins are on the map. */
export type MapLoadStep = 'spots' | 'map' | 'draw' | 'done';

/** What the loader draws: the current step, the progress from 0 to 1, and whether the snapshot is in use. */
export interface MapLoadState {
  readonly step: MapLoadStep;
  readonly progress: number;
  readonly fallback: boolean;
}

/** A load that has not started. */
export const INITIAL_MAP_LOAD_STATE: MapLoadState = {
  step: 'spots',
  progress: 0,
  fallback: false,
};

/** The steps in the order a load passes through them; a step never goes back to an earlier one. */
export const STEP_ORDER: readonly MapLoadStep[] = [
  'spots',
  'map',
  'draw',
  'done',
];

/** Where the SPOTS segment ends: the spot data is in, and the MAP segment starts. */
const SPOTS_END = 0.3;
/** Where the MAP segment ends: the framed city has painted, and the DRAW segment starts. */
const MAP_END = 0.9;

/**
 * How far into what is left of the SPOTS segment the request being sent takes it (15 %) — the
 * milestone before any response exists.
 */
const SENT_SHARE = 0.15;
/** How far into what is left of the SPOTS segment the response headers take it (60 %). */
const HEADERS_SHARE = 0.6;

/**
 * Progress once the renderer module is loaded and the map is constructed. The spec orders the MAP
 * events (renderer, then style, then tiles) but gives no numbers; this and {@link STYLE_LOADED}
 * place the two events before the tiles, which fill the rest of the segment up to
 * {@link TILES_CEILING}.
 */
const RENDERER_READY = 0.38;
/** Progress once the style is loaded; the tiles' share of the segment starts from here. */
const STYLE_LOADED = 0.46;

/** Tiles shape the bar inside the map segment but never reach the paint, which alone completes it. */
const TILES_CEILING = 0.86;

/** The progress at which the city name is fully spelled out. */
const NAME_COMPLETE_AT = 0.9;

/** Folds a monotonic progress value and step out of a build's {@link MapLoadEvent}s. */
export class MapLoadProgress {
  private current: MapLoadState = INITIAL_MAP_LOAD_STATE;

  /**
   * Where the spot request now in flight started: 0 for the live request, or the progress the live
   * one had reached when it fell back, so the snapshot continues from there instead of resetting.
   */
  private spotsBase = 0;

  /** The state after every event applied so far. */
  get state(): MapLoadState {
    return this.current;
  }

  /** Applies one event and returns the resulting state. */
  apply(event: MapLoadEvent): MapLoadState {
    switch (event.kind) {
      case 'spots-sent':
        return this.advance('spots', this.spotsAt(SENT_SHARE));
      case 'spots-headers':
        return this.advance('spots', this.spotsAt(HEADERS_SHARE));
      case 'spots-fallback':
        this.spotsBase = this.current.progress;
        this.current = { ...this.current, fallback: true };
        return this.current;
      case 'spots-done':
        return this.advance('map', SPOTS_END);
      case 'renderer-ready':
        return this.advance('map', RENDERER_READY);
      case 'style-loaded':
        return this.advance('map', STYLE_LOADED);
      case 'tiles': {
        const share =
          event.requested > 0
            ? Math.min(event.loaded, event.requested) / event.requested
            : 0;
        return this.advance(
          'map',
          STYLE_LOADED + (TILES_CEILING - STYLE_LOADED) * share,
        );
      }
      case 'painted':
        return this.advance('draw', MAP_END);
      case 'pins-drawn':
        return this.advance('done', 1);
    }
  }

  /** The progress that `share` of what is left of the SPOTS segment, from {@link spotsBase}, reaches. */
  private spotsAt(share: number): number {
    return this.spotsBase + (SPOTS_END - this.spotsBase) * share;
  }

  /** Neither the value nor the step ever goes back, whatever order late events arrive in. */
  private advance(step: MapLoadStep, progress: number): MapLoadState {
    const later =
      STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(this.current.step);
    this.current = {
      step: later ? step : this.current.step,
      progress: Math.max(this.current.progress, progress),
      fallback: this.current.fallback,
    };
    return this.current;
  }
}

/**
 * How many letters of `name` have locked, left to right: the name is spelled out at 90 %. The tiny
 * epsilon keeps float error (0.6 / 0.9 × 9 = 5.999…) from holding a letter back.
 */
export function lockedLetterCount(name: string, progress: number): number {
  return Math.floor(
    Math.min(progress / NAME_COMPLETE_AT, 1) * name.length + 1e-9,
  );
}
