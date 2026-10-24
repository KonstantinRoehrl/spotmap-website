import type { ComponentRef } from '@angular/core';
import type {
  Map as MapLibreMap,
  MapLayerMouseEvent,
  Popup as MapLibrePopup,
} from 'maplibre-gl';
import { SpotCollection, SpotFeature } from '../../../models/spots/spot';
import { prefersReducedMotion } from '../../../utils/prefers-reduced-motion';
import {
  SPOT_POPUP_FRAME_CLASS,
  type SpotPopupComponent,
} from '../spot-popup/spot-popup.component';
import { startLockOn } from './lock-on-pulse';
import type { PopupFactory } from './map-factory.token';
import {
  type Box,
  fitPopup,
  GALLERY_HEIGHT_VAR,
  type PopupAnchor,
  type PopupFit,
  popupFrame,
  POPUP_MAX_HEIGHT_VAR,
  type ScreenPoint,
} from './popup-fit';
import { dismissPopup, POPUP_PENDING_CLASS, revealPopup } from './popup-motion';
import { SPOT_SOURCE_ID } from './spot-layers';

/** How long the pan that brings an opening popup into view takes. */
const PAN_DURATION_MS = 300;

/** Reduced motion shortens the pan, never to an instant jump: a cut would lose the visitor's place. */
const PAN_REDUCED_DURATION_MS = 200;

/** The pan's ease: fast off the mark, settling gently onto the framed popup. */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** A popup on screen or about to rise: MapLibre's popup, the component in it, its spot and side. */
interface OpenPopup {
  readonly popup: MapLibrePopup;
  readonly ref: ComponentRef<SpotPopupComponent>;
  readonly spot: SpotFeature;
  readonly anchor: PopupAnchor;
  /**
   * Whether the fit has been applied. A popup added while the camera is still moving is not
   * fitted until it settles, and until then a resize has nothing to re-fit.
   */
  fitted: boolean;
  /**
   * The popup's width as the last fit measured it. A width-cap ease starts from the width the fit
   * saw, so a `transitionend` that finds the same width has nothing new to re-measure.
   */
  fittedWidth: number;
}

/**
 * What a {@link SpotPopupController} is handed by the map component that builds it: one build's
 * map, the popup factory, and what only the component can make or measure.
 */
export interface SpotPopupControllerOptions {
  /** The map this controller's popups go on, alive until the controller has removed them all. */
  readonly map: MapLibreMap;
  /** Builds MapLibre's popup frame; the component's `POPUP_FACTORY`. */
  readonly popupFactory: PopupFactory;
  /**
   * Builds the popup's component for `spot`, attached and rendered, calling `onCloseRequested`
   * when the component's own close button is pressed. It stays with the component because it needs
   * the component's injectors.
   */
  readonly createContent: (
    spot: SpotFeature,
    onCloseRequested: () => void,
  ) => ComponentRef<SpotPopupComponent>;
  /**
   * Whether the build this controller belongs to is still the component's current one. Checked
   * wherever the component compared generations before the controller existed.
   */
  readonly isCurrent: () => boolean;
  /** The box a popup must fit in, in canvas-host pixels, measured as the map is laid out now. */
  readonly fitBox: () => Box;
  /** Whether the visitor has hold of the map, so a fit must not pan it. */
  readonly isHeld: () => boolean;
}

/**
 * Opens, fits, pans, reveals and closes the popup of the tapped spot on one build's map, and keeps
 * that pin selected and locked on while it is open. A plain class, built once per map build by
 * SpotMapComponent: nothing here needs Angular's injector.
 */
export class SpotPopupController {
  /** The popup that belongs to the selection, if any — one spot at a time. */
  private open?: OpenPopup;
  /** Popups playing their close animation; {@link removeAllNow} removes them at once. */
  private readonly closing = new Set<OpenPopup>();
  /** The newest tap's component while its popup chunk loads; a later tap supersedes it. */
  private pendingRef?: ComponentRef<SpotPopupComponent>;
  /** The animation frame a coalesced re-fit waits on. */
  private refitFrame?: number;
  /**
   * The `moveend` listener that may fit or reveal the pending popup. Only the newest one acts, so
   * a pan that interrupts the one a popup waits on can take over its reveal, and a superseded or
   * torn-down popup never acts.
   */
  private armedReveal?: () => void;
  /** The selected pin's spot id, whose `selected` feature state is set. */
  private selectedId?: string;
  /**
   * Stops the selected pin's lock-on pulse and puts its ring to rest; set while a pin is
   * selected.
   */
  private cancelLockOn?: () => void;

  /** @param options the build's map and what the component makes and measures for it */
  constructor(private readonly options: SpotPopupControllerOptions) {}

  /**
   * Opens one popup for the tapped pin, carrying a {@link SpotPopupComponent}. The open popup
   * starts its close first, so a tap while another popup is open replaces it instead of leaving a
   * second component alive on the map. MapLibre builds no close button: the component draws its own
   * and asks through `closeRequested`.
   */
  openFor(
    collection: SpotCollection,
    event: Pick<MapLayerMouseEvent, 'features'>,
  ): void {
    // The rendered feature only carries the id; the loaded collection is where the typed spot —
    // photo list included — actually lives.
    const tappedId = event.features?.[0]?.id;
    const spot = collection.features.find(
      (feature) => feature.properties.id === String(tappedId),
    );
    if (!spot) {
      return;
    }

    this.closePopup();
    const id = spot.properties.id;
    this.options.map.setFeatureState(
      { source: SPOT_SOURCE_ID, id },
      { selected: true },
    );
    this.selectedId = id;
    this.cancelLockOn = startLockOn(this.options.map, id, {
      reducedMotion: prefersReducedMotion(),
    });

    const ref = this.createContent(spot);
    this.pendingRef = ref;
    void this.showPopup(spot, ref);
  }

  /** Whether a popup belongs to the selection, shown or still waiting hidden for the camera. */
  hasOpenPopup(): boolean {
    return this.open !== undefined;
  }

  /** Closes the open popup with its animation and drops the pin's selection and lock-on. */
  close(): void {
    this.closePopup();
  }

  /** Re-fits the open popup on the next animation frame, once however many re-fits are asked for. */
  scheduleRefit(): void {
    if (this.refitFrame !== undefined) {
      return;
    }
    this.refitFrame = requestAnimationFrame(() => {
      this.refitFrame = undefined;
      if (this.options.isCurrent()) {
        this.refit();
      }
    });
  }

  /**
   * Removes every popup — open, closing or still loading — at once, without animating, and drops
   * the selection. The canvas host is reused across builds, so a popup left playing its close would
   * sit on the next city's map.
   */
  removeAllNow(): void {
    const open = this.open;
    this.open = undefined;
    if (open) {
      this.discard(open);
    }
    for (const closing of [...this.closing]) {
      this.discard(closing);
    }
    if (this.pendingRef) {
      destroyRef(this.pendingRef);
      this.pendingRef = undefined;
    }
    this.armedReveal = undefined;
    this.deselect();
    if (this.refitFrame !== undefined) {
      cancelAnimationFrame(this.refitFrame);
      this.refitFrame = undefined;
    }
  }

  /**
   * Creates the popup for `ref` hidden, adds it to the map and fits it once the camera holds still.
   * The side and width cap it is created with come from where the pin is now; the fit itself is
   * done against the camera as it is when the popup is ready, because the map may move while
   * maplibre-gl loads. A tap or a teardown that overtook it while loading throws it away.
   */
  private async showPopup(
    spot: SpotFeature,
    ref: ComponentRef<SpotPopupComponent>,
    visitorHeldMap = false,
  ): Promise<void> {
    const { map } = this.options;
    const frame = popupFrame(
      this.options.fitBox(),
      map.project(spot.geometry.coordinates),
    );

    let popup: MapLibrePopup;
    try {
      popup = await this.options.popupFactory({
        anchor: frame.anchor,
        closeButton: false,
        closeOnClick: false,
        maxWidth: `${frame.maxWidth}px`,
        className: `${SPOT_POPUP_FRAME_CLASS} ${POPUP_PENDING_CLASS}`,
      });
    } catch {
      // The popup's maplibre-gl chunk never arrived. Left alone this would show an amber pin
      // with nothing beside it, so the tap is unwound: the view released, the pin dropped.
      if (this.pendingRef === ref) {
        this.pendingRef = undefined;
        this.deselect();
      }
      destroyRef(ref);
      return;
    }
    if (!this.options.isCurrent() || this.pendingRef !== ref) {
      popup.remove();
      destroyRef(ref);
      return;
    }

    this.pendingRef = undefined;
    popup
      .setLngLat(spot.geometry.coordinates)
      .setDOMContent(ref.location.nativeElement)
      .addTo(map);
    const open: OpenPopup = {
      popup,
      ref,
      spot,
      anchor: frame.anchor,
      fitted: false,
      fittedWidth: 0,
    };
    this.open = open;
    // The width cap eases on a re-fit and the next fit must measure where it settled, not partway.
    // An ease that ends on the width the fit measured, because the content was narrower than both
    // caps, has nothing to re-measure.
    popup.getElement().addEventListener('transitionend', (event) => {
      if (
        event.propertyName === 'max-width' &&
        this.open === open &&
        popup.getElement().offsetWidth !== open.fittedWidth
      ) {
        this.scheduleRefit();
      }
    });
    this.fitWhenSettled(open, visitorHeldMap);
  }

  /**
   * Fits and reveals `open` once the camera holds still. A camera still moving — the pan of a
   * popup opened a moment ago, a drag, a fling, a zoom — is about to leave the position the pin
   * has now, so the popup waits hidden for the move's `moveend` and is fitted against the camera
   * that is left. Whatever moves the camera again before then is waited out the same way.
   *
   * A visitor with hold of the map wins: the popup is fitted and revealed where the map is, never
   * panned. That is also what a grab during the wait looks like - it stops the ease being waited
   * on, which fires its `moveend` before the drag has moved the camera - and a pan then would take
   * the drag away from the visitor's finger. A wheel grab is seen the same way, but its zoom keeps
   * the camera moving, so the wait goes on past it; `visitorHeldMap` carries what an earlier check
   * saw into the fit that finally runs, once the gesture has let go.
   */
  private fitWhenSettled(open: OpenPopup, visitorHeldMap = false): void {
    const { map } = this.options;
    this.armedReveal = undefined;
    const held = visitorHeldMap || this.options.isHeld();
    if (!map.isMoving()) {
      const fit = this.fitToCamera(open, held);
      if (fit) {
        this.panThenReveal(open, held ? [0, 0] : fit.panBy);
      }
      return;
    }
    const onSettle = () => {
      if (this.armedReveal !== onSettle) {
        return;
      }
      this.armedReveal = undefined;
      if (this.open === open) {
        this.fitWhenSettled(open, held);
      }
    };
    this.armedReveal = onSettle;
    map.once('moveend', onSettle);
  }

  /**
   * Fits `open` against the camera as it is now: the width cap, then the measured fit. Returns
   * the fit, or `undefined` when its side ran out of room and it was swapped for a fresh popup on
   * the other side (MapLibre has no public anchor setter), which fits itself the same way and
   * inherits `visitorHeldMap`.
   */
  private fitToCamera(
    open: OpenPopup,
    visitorHeldMap = false,
  ): PopupFit | undefined {
    const box = this.options.fitBox();
    const pin = this.options.map.project(open.spot.geometry.coordinates);
    open.popup.setMaxWidth(`${popupFrame(box, pin).maxWidth}px`);
    const fit = this.applyFit(open, box, pin, open.anchor);
    open.fitted = true;
    if (fit.anchor === open.anchor) {
      return fit;
    }
    this.closePopup({ keepSelection: true });
    const ref = this.createContent(open.spot);
    this.pendingRef = ref;
    void this.showPopup(open.spot, ref, visitorHeldMap);
    return undefined;
  }

  /**
   * Measures the popup as it laid out and applies the fit: the height cap and the gallery's
   * height go on the container as CSS variables, and the component learns whether its body
   * scrolls. On a re-fit `keepAnchor` holds the side the popup opened on while it still has room.
   */
  private applyFit(
    open: OpenPopup,
    box: Box,
    pin: ScreenPoint,
    keepAnchor?: PopupAnchor,
  ): PopupFit {
    const { gallery, body } = open.ref.instance.naturalHeights();
    const element = open.popup.getElement();
    open.fittedWidth = element.offsetWidth;
    const content = element.querySelector<HTMLElement>(
      '.maplibregl-popup-content',
    );
    // The frame's padding and border sit around the component, inside the capped content box.
    const chrome =
      (content?.offsetHeight ?? 0) -
      (open.ref.location.nativeElement as HTMLElement).offsetHeight;
    const fit = fitPopup({
      box,
      pin,
      width: open.fittedWidth,
      naturalGalleryHeight: gallery,
      naturalBodyHeight: body + chrome,
      keepAnchor,
    });
    element.style.setProperty(POPUP_MAX_HEIGHT_VAR, `${fit.maxHeight}px`);
    if (gallery > 0) {
      element.style.setProperty(GALLERY_HEIGHT_VAR, `${fit.galleryHeight}px`);
    }
    open.ref.setInput('scrolls', fit.scrolls);
    open.ref.changeDetectorRef.detectChanges();
    return fit;
  }

  /**
   * Reveals the popup once it is in view: at once when it already is, otherwise after the pan
   * settles. A visitor grabbing the map stops the ease, which fires `moveend` too, so the popup
   * opens where the map now is and is not panned again.
   */
  private panThenReveal(open: OpenPopup, panBy: [number, number]): void {
    if (panBy[0] === 0 && panBy[1] === 0) {
      this.reveal(open);
      return;
    }
    this.panRevealing(open, panBy);
  }

  /**
   * Pans by `panBy` and reveals `open` when that pan settles. The listener is armed only after the
   * pan has started: a `panBy` that stops a still-running ease fires that ease's `moveend`
   * synchronously, and that one must not reveal `open`. A pan that has already ended by the time
   * `panBy` returns fired its own `moveend` too, so the popup is revealed at once instead.
   */
  private panRevealing(open: OpenPopup, panBy: [number, number]): void {
    this.armedReveal = undefined;
    this.pan(panBy);
    if (this.options.map.isMoving()) {
      this.revealOnSettle(open);
    } else {
      this.reveal(open);
    }
  }

  /** Reveals `open` on the next `moveend`, unless a newer pan has taken the reveal over. */
  private revealOnSettle(open: OpenPopup): void {
    const reveal = () => {
      if (this.armedReveal === reveal) {
        this.armedReveal = undefined;
        this.reveal(open);
      }
    };
    this.armedReveal = reveal;
    this.options.map.once('moveend', reveal);
  }

  /** Shows `open` with its animation, if it is still the open popup and not shown yet. */
  private reveal(open: OpenPopup): void {
    if (this.open === open && isPending(open)) {
      revealPopup(open.popup.getElement(), prefersReducedMotion());
    }
  }

  /**
   * Eases the camera by `panBy`, shortened under reduced motion. `essential` because MapLibre
   * otherwise turns every ease into an instant jump under reduced motion, and the shortened ease
   * here already is the reduced-motion version.
   */
  private pan(panBy: [number, number]): void {
    this.options.map.panBy(panBy, {
      duration: prefersReducedMotion()
        ? PAN_REDUCED_DURATION_MS
        : PAN_DURATION_MS,
      easing: easeOutCubic,
      essential: true,
    });
  }

  /**
   * Closes the open popup with its animation and removes it once that has played. The pin's
   * selection and lock-on drop at once, unless `keepSelection` — a popup swapping sides keeps its
   * pin selected.
   */
  private closePopup({ keepSelection = false } = {}): void {
    const open = this.open;
    this.open = undefined;
    if (!keepSelection) {
      this.deselect();
    }
    if (!open) {
      return;
    }
    this.closing.add(open);
    void dismissPopup(open.popup.getElement(), prefersReducedMotion()).then(
      () => this.discard(open),
    );
  }

  /**
   * Removes a popup from the map and destroys the component inside it. One popup is created per
   * pin tap, so anything left behind here leaks on every tap (QC6).
   */
  private discard(open: OpenPopup): void {
    this.closing.delete(open);
    open.popup.remove();
    destroyRef(open.ref);
  }

  /** Stops the lock-on pulse and drops the selected pin's feature state. */
  private deselect(): void {
    this.cancelLockOn?.();
    this.cancelLockOn = undefined;

    const id = this.selectedId;
    this.selectedId = undefined;
    if (id !== undefined) {
      this.options.map.removeFeatureState(
        { source: SPOT_SOURCE_ID, id },
        'selected',
      );
    }
  }

  /**
   * Fits the open popup to the resized map. On the same side its caps change and the map pans any
   * part pushed out back into view; when that side ran out of room the popup is swapped for one on
   * the other side, the old one fading out as the new one rises. A popup still waiting for the
   * camera to settle is fitted then, against the resized map.
   *
   * A visitor with hold of the map wins here too: the caps and the side are re-fitted, but nothing
   * pans, since a pan would take the drag from their finger. The popup is not panned in once they
   * let go either; a pending popup still reveals when the pan it waits on ends.
   */
  private refit(): void {
    const open = this.open;
    if (!open?.fitted) {
      return;
    }
    const held = this.options.isHeld();
    const fit = this.fitToCamera(open, held);
    if (!held && fit && (fit.panBy[0] !== 0 || fit.panBy[1] !== 0)) {
      // This pan stops the one a pending popup waits on, so its reveal moves to this pan's end.
      if (isPending(open)) {
        this.panRevealing(open, fit.panBy);
      } else {
        this.pan(fit.panBy);
      }
    }
  }

  /**
   * Builds the popup's component for `spot`. Only the open popup's own close button closes it: a
   * close request from a popup already closing, or one a later tap has superseded, does nothing.
   */
  private createContent(spot: SpotFeature): ComponentRef<SpotPopupComponent> {
    const ref = this.options.createContent(spot, () => {
      if (this.open?.ref === ref) {
        this.closePopup();
      }
    });
    return ref;
  }
}

/** Whether the popup is still hidden, waiting for its pan to settle before it rises. */
function isPending(open: OpenPopup): boolean {
  return open.popup.getElement().classList.contains(POPUP_PENDING_CLASS);
}

/** Destroys a popup's component unless something already has. */
function destroyRef(ref: ComponentRef<SpotPopupComponent>): void {
  if (!ref.hostView.destroyed) {
    ref.destroy();
  }
}
