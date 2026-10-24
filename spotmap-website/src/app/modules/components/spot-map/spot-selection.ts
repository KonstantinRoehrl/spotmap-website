import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import { type LockOnMap, startLockOn } from './lock-on-pulse';
import { SPOT_SOURCE_ID } from './spot-layers';

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
}

/**
 * The selected pin of one map build: the `selected` feature state that grows it and puts the
 * amber ring round it, and the lock-on pulse that marks a fresh selection. Which spot is selected
 * is the URL's to say (spec §7); this only shows it. A plain class, built by SpotMapComponent once
 * a build's pins exist, since feature state needs their source.
 */
export class SpotSelection {
  /** The spot shown selected, if any. */
  private current: string | null = null;
  /** Stops the current pulse and puts its ring to rest; set while one may be running. */
  private cancelLockOn?: () => void;

  /** @param map the build's map, with its spot source already added */
  constructor(private readonly map: SelectionMap) {}

  /** The spot shown selected, or `null`. */
  get selectedId(): string | null {
    return this.current;
  }

  /**
   * Shows `id` selected, dropping the previous pin's state and pulse first; `null` clears the
   * selection. Showing the spot already shown does nothing, so no pulse replays.
   */
  show(id: string | null, { pulse }: ShowOptions): void {
    if (id === this.current) {
      return;
    }
    this.clear();
    if (id === null) {
      return;
    }
    this.map.setFeatureState(
      { source: SPOT_SOURCE_ID, id },
      { selected: true },
    );
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
