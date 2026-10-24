import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { type LockOnMap, startLockOn } from './lock-on-pulse';
import {
  flagFilter,
  photoPinFilter,
  SPOT_FLAG_LAYER_ID,
  SPOT_PHOTO_LAYER_ID,
  SPOT_SOURCE_ID,
} from './spot-layers';

/** The map calls a selection makes, narrowed so specs can drive it with a fake. */
export interface SelectionMap extends LockOnMap {
  setFeatureState(
    target: { source: string; id: string },
    state: Record<string, unknown>,
  ): unknown;
  removeFeatureState(
    target: { source: string; id: string },
    key?: string,
  ): unknown;
}

/** How a change of selection is shown. */
export interface ShowOptions {
  /**
   * Whether the lock-on pulse marks the moment. A tap earns it; a selection a map was built with
   * — a shared link opened cold, or a rebuild — shows at rest.
   */
  readonly pulse: boolean;
  /** Whether the spot has a photo, so its flag can fly. */
  readonly hasCover?: boolean;
}

/** What a build's map carries beyond the pins. */
export interface SelectionOptions {
  /** Whether the photo pin and flag layers are on the map (a photo host is configured). */
  readonly flag: boolean;
}

/**
 * The selected pin of one map build: the `selected` feature state that grows it and puts the
 * amber ring round it, and the lock-on pulse that marks a fresh selection. Which spot is selected
 * is the URL's to say (spec §7); this only shows it. A plain class, built by SpotMapComponent once
 * a build's pins exist, since feature state needs their source. With the photo layers on the map
 * it also flies the selected spot's photo as the amber flag.
 */
export class SpotSelection {
  /** The spot shown selected, if any. */
  private current: string | null = null;
  /** Stops the current pulse and puts its ring to rest; set while one may be running. */
  private cancelLockOn?: () => void;

  /**
   * @param map the build's map, with its spot source already added
   * @param options whether the flag layers exist
   */
  constructor(
    private readonly map: SelectionMap,
    private readonly options: SelectionOptions = { flag: false },
  ) {}

  /** The spot shown selected, or `null`. */
  get selectedId(): string | null {
    return this.current;
  }

  /**
   * Shows `id` selected, dropping the previous pin's state and pulse first; `null` clears the
   * selection. Showing the spot already shown does nothing, so no pulse replays.
   */
  show(id: string | null, { pulse, hasCover }: ShowOptions): void {
    if (id === this.current) {
      return;
    }
    const previous = this.current;
    this.clear();
    if (id === null) {
      if (previous !== null) {
        this.pointFlag(null, false);
      }
      return;
    }
    this.map.setFeatureState(
      { source: SPOT_SOURCE_ID, id },
      { selected: true },
    );
    this.pointFlag(id, hasCover ?? false);
    this.current = id;
    if (pulse) {
      this.cancelLockOn = startLockOn(this.map, id, {
        reducedMotion: prefersReducedMotion(),
      });
    }
  }

  /**
   * Stops a running pulse, which puts its ring to rest on the live map. Called before the map is
   * removed: a removed map has no style left to paint. The feature state goes with the map.
   */
  dispose(): void {
    this.cancelLockOn?.();
    this.cancelLockOn = undefined;
  }

  /**
   * Flies the flag over `id` when it has a photo and takes its photo pin away meanwhile; `null`
   * lowers the flag and gives the pin back. A filter change re-lays out the spot tiles, so it is
   * made once per selection, never per frame.
   */
  private pointFlag(id: string | null, hasCover: boolean): void {
    if (!this.options.flag) {
      return;
    }
    this.map.setFilter(SPOT_FLAG_LAYER_ID, flagFilter(hasCover ? id : null));
    this.map.setFilter(SPOT_PHOTO_LAYER_ID, photoPinFilter(id));
  }

  /** Stops the pulse and drops the selected pin's feature state. */
  private clear(): void {
    this.dispose();
    const id = this.current;
    this.current = null;
    if (id !== null) {
      this.map.removeFeatureState({ source: SPOT_SOURCE_ID, id }, 'selected');
    }
  }
}
