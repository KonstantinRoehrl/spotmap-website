import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import { SpotCollection, SpotFeature } from '../../../models/spots/spot';
import { SpotPopupComponent } from '../spot-popup/spot-popup.component';
import type { PopupFactory } from './map-factory.token';
import { type PointerHold, trackPointerHold } from './pointer-hold';
import {
  type Box,
  fitBoxWithin,
  POPUP_FIT_MARGIN_PX,
  POPUP_MAX_HEIGHT_VAR,
} from './popup-fit';
import { LOCK_ON_AT_REST_FILTER, SPOT_HIT_LAYER_ID } from './spot-layers';
import { SpotPopupController } from './spot-popup-controller';
import {
  CameraMove,
  COLLECTION,
  FakeMap,
  FakePopup,
  flushPending,
  holdAnimationFrames,
  LOCK_ON_AT_REST,
  onlySpot,
  requestReducedMotion,
  setWidth,
  tapOn,
} from './testing/fake-map';

describe('SpotPopupController', () => {
  let fake: FakeMap;
  let popups: FakePopup[];
  /** The laid-out element popups are added to, standing in for SpotMapComponent's canvas host. */
  let host: HTMLElement;
  let hold: PointerHold | undefined;
  let controller: SpotPopupController | undefined;
  /** What `isCurrent` answers; a spec sets it false to replace the build under the controller. */
  let current: boolean;
  let popupFactoryRejects: boolean;
  /** While set, the fake popup factory answers only once it settles: the popup chunk still loading. */
  let popupGate: Promise<void> | undefined;
  /**
   * The `onCloseRequested` callback the controller handed {@link createContent} for each popup
   * component, in creation order: calling one is that popup's close button being pressed.
   */
  let closeRequests: (() => void)[];

  beforeEach(() => {
    fake = new FakeMap();
    popups = [];
    current = true;
    popupFactoryRejects = false;
    popupGate = undefined;
    closeRequests = [];
    hold = undefined;
    controller = undefined;
    host = document.createElement('div');
    host.style.cssText =
      'display:block;width:1000px;height:600px;position:relative';
    document.body.append(host);
    // Pinned around the host, as the component spec pins it around its fixture: the fit box is
    // then the host inset by its margin, whatever frame the suite runs in.
    spyOnProperty(window, 'visualViewport').and.callFake(() => {
      const box = host.getBoundingClientRect();
      return {
        offsetLeft: box.left,
        offsetTop: box.top,
        width: box.width,
        height: box.height,
      } as VisualViewport;
    });
  });

  afterEach(() => {
    controller?.removeAllNow();
    hold?.stop();
    fake.remove();
    host.remove();
  });

  /** SpotMapComponent's `fitBox`, over the host, with no attribution control on the map. */
  function fitBox(): Box {
    const visual = window.visualViewport!;
    return fitBoxWithin(
      host.getBoundingClientRect(),
      {
        left: visual.offsetLeft,
        top: visual.offsetTop,
        right: visual.offsetLeft + visual.width,
        bottom: visual.offsetTop + visual.height,
      },
      POPUP_FIT_MARGIN_PX,
      0,
    );
  }

  /**
   * SpotMapComponent's `createContent`: a real popup component, attached, rendered, wired to close.
   * The callback is also kept in {@link closeRequests}, so a spec can press a popup's close button
   * after the popup has been superseded or has started closing.
   */
  function createContent(
    spot: SpotFeature,
    onCloseRequested: () => void,
  ): ComponentRef<SpotPopupComponent> {
    const ref = createComponent(SpotPopupComponent, {
      environmentInjector: TestBed.inject(EnvironmentInjector),
    });
    ref.setInput('spot', spot);
    ref.instance.closeRequested.subscribe(onCloseRequested);
    closeRequests.push(onCloseRequested);
    TestBed.inject(ApplicationRef).attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    return ref;
  }

  /** The popup factory the component spec provides, adding popups to {@link host}. */
  const popupFactory: PopupFactory = (options) => {
    if (popupFactoryRejects) {
      // The realistic failure: the lazy maplibre-gl chunk never arrives.
      return Promise.reject(new Error('popup chunk failed to load'));
    }
    const build = () => {
      const popup = new FakePopup(options, () => host);
      popups.push(popup);
      return popup as unknown as Awaited<ReturnType<PopupFactory>>;
    };
    return popupGate ? popupGate.then(build) : Promise.resolve(build());
  };

  /**
   * Builds the controller on the fake map with the real pointer-hold tracker, and wires it the way
   * SpotMapComponent's `wireInteractions` does: a pin click opens through `openFor`, a resize
   * schedules a re-fit. The component spec's wiring specs pin that the component does the same.
   */
  function createController({
    collection = COLLECTION,
  }: { collection?: object } = {}): SpotPopupController {
    const tracker = trackPointerHold(fake as unknown as MapLibreMap);
    hold = tracker;
    const built = new SpotPopupController({
      map: fake as unknown as MapLibreMap,
      popupFactory,
      createContent,
      isCurrent: () => current,
      fitBox,
      isHeld: () => tracker.isHeld(),
    });
    controller = built;
    fake.on('click', SPOT_HIT_LAYER_ID, (event: unknown) =>
      built.openFor(collection as SpotCollection, event as MapLayerMouseEvent),
    );
    fake.on('resize', () => built.scheduleRefit());
    return built;
  }

  /** Waits as `fixture.whenStable()` did: until the app has rendered what the last step changed. */
  function settle(): Promise<void> {
    return TestBed.inject(ApplicationRef).whenStable();
  }

  async function tap(id: string) {
    fake.emit('click', tapOn(id), 'spots-hit');
    await settle();
  }

  /**
   * Holds the popup factory — maplibre-gl's lazy chunk still on its way — until the returned
   * function is called, which lets every held popup through and waits for the controller to act.
   */
  function holdPopupFactory(): () => Promise<void> {
    let letThrough!: () => void;
    popupGate = new Promise<void>((resolve) => {
      letThrough = resolve;
    });
    return () => {
      popupGate = undefined;
      letThrough();
      return flushPending();
    };
  }

  /** The pans the controller asked the map for, in order. */
  function pansRequested(): CameraMove[] {
    return fake.cameraMoves.filter((move) => move.method === 'panBy');
  }

  /** Lets every animation on the popup's container finish, and the controller act on that. */
  async function settleAnimations(popup: FakePopup | undefined) {
    const element = popup?.getElement();
    await Promise.all(
      (element?.getAnimations() ?? []).map((animation) =>
        animation.finished.catch(() => undefined),
      ),
    );
    await settle();
  }

  it('closes the open popup with its animation and drops the selection', async () => {
    createController();
    await tap('a');
    expect(controller!.hasOpenPopup()).withContext('a is open').toBe(true);
    controller!.close();
    expect(controller!.hasOpenPopup()).toBe(false);
    expect(fake.featureStates['a']?.['selected'])
      .withContext('the selection drops at once')
      .toBeUndefined();
    expect(popups[0]?.removed)
      .withContext('still on the map while it plays its close')
      .toBe(false);
    await settleAnimations(popups[0]);
    expect(popups[0]?.removed).toBe(true);
  });

  it('re-fits once per frame however many re-fits are asked for', async () => {
    holdAnimationFrames();
    createController();
    await tap('a');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    frames.calls.reset();
    controller!.scheduleRefit();
    controller!.scheduleRefit();
    controller!.scheduleRefit();
    expect(frames).toHaveBeenCalledTimes(1);
  });

  it('removes the open popup and one still closing at once, and drops the selection', async () => {
    createController();
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    await tap('a');
    await tap('b');
    expect(popups[0]?.removed).withContext('a is still closing').toBe(false);
    controller!.removeAllNow();
    expect(popups.map((popup) => popup.removed)).toEqual([true, true]);
    expect(controller!.hasOpenPopup()).toBe(false);
    expect(fake.featureStates['b']?.['selected']).toBeUndefined();
    expect(appRef.viewCount).toBe(baseline);
  });

  it('throws away a popup still loading when everything is removed, and cancels a pending re-fit', async () => {
    // Reduced motion: the lock-on then asks for no frames, so every frame below is the re-fit's.
    requestReducedMotion(true);
    const cancelFrame = holdAnimationFrames();
    createController();
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    const letThrough = holdPopupFactory();
    fake.emit('click', tapOn('a'), 'spots-hit');
    controller!.scheduleRefit();
    controller!.removeAllNow();
    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
    const frames = window.requestAnimationFrame as jasmine.Spy;
    frames.calls.reset();
    controller!.scheduleRefit();
    expect(frames)
      .withContext('the cancelled frame no longer holds the next re-fit back')
      .toHaveBeenCalledTimes(1);
    await letThrough();
    expect(popups[0]?.addedTo)
      .withContext('never added to the map')
      .toBeUndefined();
    expect(popups[0]?.removed).toBe(true);
    expect(appRef.viewCount).toBe(baseline);
  });

  it('throws away a popup whose build was replaced while maplibre-gl loaded', async () => {
    createController();
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    const letThrough = holdPopupFactory();
    fake.emit('click', tapOn('a'), 'spots-hit');
    current = false;
    await letThrough();
    expect(popups[0]?.addedTo).toBeUndefined();
    expect(popups[0]?.removed).toBe(true);
    expect(appRef.viewCount).toBe(baseline);
  });

  it('skips a re-fit whose frame runs after its build was replaced', async () => {
    requestReducedMotion(true);
    holdAnimationFrames();
    createController();
    fake.projected = { x: 500, y: 40 };
    await tap('a');
    const capsBefore = popups[0]!.maxWidths.length;
    // The pin now sits where a live re-fit would swap the popup to the other side.
    fake.projected = { x: 500, y: 560 };
    controller!.scheduleRefit();
    current = false;
    const frames = window.requestAnimationFrame as jasmine.Spy;
    (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    await settle();
    expect(popups.length).withContext('no swap to the other side').toBe(1);
    expect(popups[0]?.maxWidths.length)
      .withContext('no re-fit at all')
      .toBe(capsBefore);
  });

  it('opens one popup for the tapped pin and marks that pin selected', async () => {
    createController();
    await tap('a');
    expect(popups.length).toBe(1);
    expect(popups[0]?.options.maxWidth).toBe('320px');
    expect(popups[0]?.options.className).toContain('spot-popup-frame');
    expect(popups[0]?.lngLat).toEqual([16.37, 48.2]);
    expect(popups[0]?.addedTo === fake)
      .withContext('the popup was added to the live map')
      .toBe(true);
    expect(popups[0]?.content?.textContent).toContain('Alpha Bank');
    expect(fake.featureStates['a']?.['selected']).toBe(true);
  });

  it('asks MapLibre for no close button of its own', async () => {
    createController();
    await tap('a');
    expect(popups[0]?.options.closeButton).toBe(false);
  });

  it("closes with the animation from the popup's close button", async () => {
    createController();
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    await tap('a');
    const close =
      popups[0]?.content?.querySelector<HTMLElement>('.spot-popup__close');
    expect(close)
      .withContext('the popup renders its close button')
      .toBeTruthy();
    close?.click();
    expect(popups[0]?.removed)
      .withContext('still on the map while it plays its close')
      .toBe(false);
    expect(fake.featureStates['a']?.['selected'])
      .withContext('the selection drops at once')
      .toBeUndefined();
    await settleAnimations(popups[0]);
    expect(popups[0]?.removed).toBe(true);
    expect(appRef.viewCount).toBe(baseline);
  });

  it('ignores the close button of a popup a later tap has superseded, leaving the newer popup open', async () => {
    createController();
    await tap('a');
    await tap('b');
    // a is playing its close; its button still reaches the controller.
    closeRequests[0]!();
    expect(controller!.hasOpenPopup())
      .withContext('b is still the open popup')
      .toBe(true);
    expect(fake.featureStates['b']?.['selected'])
      .withContext("a's request does not deselect b")
      .toBe(true);
    await settleAnimations(popups[1]);
    expect(popups[1]?.removed)
      .withContext('b was never told to close')
      .toBe(false);
  });

  it('ignores the close button of a popup that has started closing to swap sides, keeping its pin selected', async () => {
    requestReducedMotion(true);
    holdAnimationFrames();
    createController();
    fake.projected = { x: 500, y: 40 };
    await tap('a');
    const letThrough = holdPopupFactory();
    fake.projected = { x: 500, y: 560 };
    fake.emit('resize');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    expect(controller!.hasOpenPopup())
      .withContext('the other side is still loading: nothing is open')
      .toBe(false);
    // The pressed button belongs to a, which is already playing its close.
    closeRequests[0]!();
    expect(fake.featureStates['a']?.['selected'])
      .withContext('the pin stays selected through the swap')
      .toBe(true);
    await letThrough();
    expect(popups[1]?.options.anchor).toBe('bottom');
    expect(controller!.hasOpenPopup()).toBe(true);
    expect(fake.featureStates['a']?.['selected']).toBe(true);
  });

  it('moves the selection on a second tap instead of stacking popups', async () => {
    createController();
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    await tap('a');
    expect(appRef.viewCount).toBe(baseline + 1);
    await tap('b');
    expect(popups.length).toBe(2);
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
    expect(fake.featureStates['b']?.['selected']).toBe(true);
    await settleAnimations(popups[0]);
    expect(popups[0]?.removed).toBe(true);
    expect(popups[1]?.removed).toBe(false);
    expect(appRef.viewCount).toBe(baseline + 1);
  });

  it("creates the popup hidden, with a fixed side and MapLibre's own closing off", async () => {
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    const options = popups[0]?.options;
    expect(options?.anchor).toBe('bottom');
    expect(options?.closeButton).toBe(false);
    expect(options?.closeOnClick).toBe(false);
    expect(options?.className).toContain('spot-popup-frame--pending');
    expect(popups[0]?.isPending())
      .withContext('hidden until the pan has settled')
      .toBe(true);
  });

  it('eases the popup width on a re-fit, but snaps it while the popup is still hidden', async () => {
    createController();
    await tap('a');
    const shown = getComputedStyle(popups[0]!.getElement());
    expect(popups[0]?.isPending()).toBe(false);
    expect(shown.transitionProperty).toBe('max-width');
    expect(shown.transitionDuration).toBe('0.2s');

    fake.projected = { x: 20, y: 500 };
    await tap('b');
    expect(popups[1]?.isPending()).toBe(true);
    expect(getComputedStyle(popups[1]!.getElement()).transitionProperty)
      .withContext('a hidden popup is measured at the width it is heading for')
      .toBe('none');
  });

  it('re-fits once the popup width has finished easing to a different width, so it is measured where it settled', async () => {
    holdAnimationFrames();
    createController();
    await tap('a');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    frames.calls.reset();
    const element = popups[0]!.getElement();
    // The ease began from the width the fit measured; it ends on another one.
    setWidth(element, element.offsetWidth + 40);
    element.dispatchEvent(
      new TransitionEvent('transitionend', {
        propertyName: 'max-height',
        bubbles: true,
      }),
    );
    expect(frames).not.toHaveBeenCalled();
    element.dispatchEvent(
      new TransitionEvent('transitionend', {
        propertyName: 'max-width',
        bubbles: true,
      }),
    );
    expect(frames).toHaveBeenCalledTimes(1);
  });

  it('does not re-fit when the width cap eased but the popup ended as wide as it was measured', async () => {
    holdAnimationFrames();
    createController();
    await tap('a');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    frames.calls.reset();
    popups[0]!.getElement().dispatchEvent(
      new TransitionEvent('transitionend', {
        propertyName: 'max-width',
        bubbles: true,
      }),
    );
    expect(frames).not.toHaveBeenCalled();
  });

  it('opens below a pin near the top', async () => {
    createController();
    fake.projected = { x: 500, y: 40 };
    await tap('a');
    expect(popups[0]?.options.anchor).toBe('top');
  });

  it('pans the popup into view, then reveals it when the camera settles', async () => {
    requestReducedMotion(false);
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    const pans = fake.cameraMoves.filter((move) => move.method === 'panBy');
    expect(pans.length).toBe(1);
    expect(pans[0]?.options.offset?.[0]).toBeLessThan(0);
    expect(pans[0]?.options.duration).toBe(300);
    expect(popups[0]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
  });

  it('reveals at once when no pan is needed', async () => {
    createController();
    await tap('a');
    expect(fake.cameraMoves.filter((move) => move.method === 'panBy')).toEqual(
      [],
    );
    expect(popups[0]?.isPending()).toBe(false);
  });

  it('shortens the pan under reduced motion, never to an instant jump', async () => {
    requestReducedMotion(true);
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    const pans = fake.cameraMoves.filter((move) => move.method === 'panBy');
    expect(pans.map((move) => move.options.duration)).toEqual([200]);
  });

  it('opens where the visitor left the map when they grab it mid-pan', async () => {
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    // A grab stops MapLibre's ease, which fires `moveend` with the camera wherever it stopped.
    fake.projected = { x: 90, y: 500 };
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
    expect(
      fake.cameraMoves.filter((move) => move.method === 'panBy').length,
    ).toBe(1);
  });

  it("keeps a popup tapped during another's pan hidden until its own pan settles", async () => {
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    expect(popups[0]?.isPending()).withContext('a is still panning').toBe(true);
    // b waits for a's pan to end before it is fitted, so a's pan is not interrupted by b's.
    await tap('b');
    expect(pansRequested().length)
      .withContext('b asks for no pan while a is still easing')
      .toBe(1);
    expect(popups[1]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(pansRequested().length)
      .withContext(
        "b is fitted once a's pan has settled, and needs its own pan",
      )
      .toBe(2);
    expect(popups[1]?.isPending())
      .withContext("a's pan ending does not reveal b")
      .toBe(true);
    fake.emit('moveend');
    expect(popups[1]?.isPending()).toBe(false);
  });

  it('keeps a popup tapped mid-ease hidden until the camera settles, then fits it against the settled camera', async () => {
    requestReducedMotion(false);
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    expect(pansRequested().length).toBe(1);
    // b is tapped partway along a's ease, where it sits mid-map and needs no pan of its own.
    fake.projected = { x: 500, y: 300 };
    await tap('b');
    expect(popups[1]?.isPending())
      .withContext('b is not revealed from its mid-ease position')
      .toBe(true);
    expect(pansRequested().length).toBe(1);
    // a's ease ends and has carried the map, leaving b at the left edge.
    fake.projected = { x: 20, y: 500 };
    fake.emit('moveend');
    expect(pansRequested().length)
      .withContext('b is fitted against where the map settled')
      .toBe(2);
    expect(pansRequested()[1]?.options.offset?.[0])
      .withContext('the pan brings b in from the left edge it settled at')
      .toBeLessThan(0);
    expect(popups[1]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(popups[1]?.isPending()).toBe(false);
    fake.emit('moveend');
    expect(popups[1]?.getElement().getAnimations().length)
      .withContext('revealed exactly once')
      .toBe(1);
  });

  it('waits out a drag or fling the visitor started before it fits and reveals', async () => {
    createController();
    fake.startMove();
    await tap('a');
    expect(popups[0]?.isPending())
      .withContext('hidden while the map is still gliding')
      .toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending())
      .withContext('fitted and revealed where the glide ended')
      .toBe(false);
    expect(pansRequested()).toEqual([]);
  });

  it('keeps waiting when the camera is moving again by the time the last move ends', async () => {
    createController();
    fake.startMove();
    // Registered first, so it runs before the controller's own `moveend` listener: the move that
    // ends hands over to another one at once, as a fling does after a drag.
    fake.once('moveend', () => fake.startMove());
    await tap('a');
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
  });

  describe('a popup tapped while another popup is panning into view', () => {
    /** Opens `a` at the left edge, so its pan is under way, then taps `b` at the same edge. */
    async function tapBWhileAPans() {
      requestReducedMotion(false);
      createController();
      fake.projected = { x: 20, y: 500 };
      await tap('a');
      await tap('b');
      expect(pansRequested().length)
        .withContext("b asks for no pan while a's ease runs")
        .toBe(1);
      expect(popups[1]?.isPending()).toBe(true);
    }

    it("is fitted and panned when a's ease runs to its end, and revealed once that pan ends", async () => {
      await tapBWhileAPans();
      fake.emit('moveend');
      expect(pansRequested().length)
        .withContext('b is fitted against the settled camera and pans')
        .toBe(2);
      expect(popups[1]?.isPending())
        .withContext("a's ease ending does not reveal b")
        .toBe(true);
      fake.emit('moveend');
      expect(popups[1]?.isPending()).toBe(false);
      expect(popups[1]?.getElement().getAnimations().length)
        .withContext('revealed exactly once')
        .toBe(1);
    });

    it('is fitted but not panned when the visitor grabs the map, and opens where the map now is', async () => {
      await tapBWhileAPans();
      fake.grab();
      expect(pansRequested().length)
        .withContext(
          "the grab wins: a pan would take the drag from the visitor's finger",
        )
        .toBe(1);
      expect(popups[1]?.isPending()).toBe(false);
      expect(
        popups[1]?.getElement().style.getPropertyValue(POPUP_MAX_HEIGHT_VAR),
      )
        .withContext('fitted against the live camera all the same')
        .not.toBe('');
      fake.drag();
      fake.release();
      expect(pansRequested().length)
        .withContext('nothing pans the popup in after the drag either')
        .toBe(1);
      expect(popups[1]?.getElement().getAnimations().length)
        .withContext('revealed exactly once')
        .toBe(1);
    });

    it('is fitted but not panned when the visitor grabs the map with the wheel, even once the zoom has ended', async () => {
      await tapBWhileAPans();
      // The wheel stops a's ease with the zoom already under way, so b sees a moving camera.
      fake.wheel();
      expect(popups[1]?.isPending())
        .withContext('b keeps waiting while the zoom runs')
        .toBe(true);
      fake.endWheel();
      expect(pansRequested().length)
        .withContext(
          'the wheel grab wins even though the zoom has finished by the time b is fitted',
        )
        .toBe(1);
      expect(popups[1]?.isPending()).toBe(false);
      expect(popups[1]?.getElement().getAnimations().length)
        .withContext('revealed exactly once')
        .toBe(1);
    });

    it('is fitted and panned as usual by a tap after the visitor let go of the map', async () => {
      await tapBWhileAPans();
      fake.grab();
      fake.drag();
      fake.release();
      expect(pansRequested().length).toBe(1);
      await tap('a');
      expect(pansRequested().length)
        .withContext(
          'the newer popup pans into view now that nothing holds the map',
        )
        .toBe(2);
      expect(popups[2]?.isPending()).toBe(true);
      fake.emit('moveend');
      expect(popups[2]?.isPending()).toBe(false);
    });

    it('is fitted but not panned while a finger rests on the map when its popup is ready', async () => {
      requestReducedMotion(false);
      createController();
      fake.projected = { x: 20, y: 500 };
      fake.grab();
      await tap('a');
      expect(pansRequested())
        .withContext('a pan would reset the visitor’s hold on the map')
        .toEqual([]);
      expect(popups[0]?.isPending()).toBe(false);
    });
  });

  describe('a resize while the visitor holds the map', () => {
    /** Runs the animation frame the resize asked the re-fit for. */
    function runRefitFrame() {
      const frames = window.requestAnimationFrame as jasmine.Spy;
      (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    }

    /** Opens `a` at the left edge with a finger resting on the map: fitted, revealed, not panned. */
    async function openAtEdgeUnderFinger() {
      requestReducedMotion(false);
      holdAnimationFrames();
      createController();
      fake.projected = { x: 20, y: 500 };
      fake.grab();
      await tap('a');
      expect(pansRequested()).toEqual([]);
      expect(popups[0]?.isPending()).toBe(false);
    }

    it('re-fits the popup without panning, and does not pan it in after the finger comes up', async () => {
      await openAtEdgeUnderFinger();
      const capsBefore = popups[0]?.maxWidths.length ?? 0;
      fake.resize();
      runRefitFrame();
      expect(popups[0]?.maxWidths.length)
        .withContext('the width cap is re-measured all the same')
        .toBeGreaterThan(capsBefore);
      expect(pansRequested())
        .withContext("a pan would take the drag from the visitor's finger")
        .toEqual([]);
      fake.drag();
      fake.release();
      expect(pansRequested())
        .withContext('the gesture won: nothing pans the popup in afterwards')
        .toEqual([]);
    });

    it('pans the popup back into view on a resize once nothing holds the map', async () => {
      await openAtEdgeUnderFinger();
      fake.release();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
      expect(pansRequested()[0]?.options.offset?.[0]).toBeLessThan(0);
    });

    it('still holds the map after the resize has reset the handlers, until the pointer comes up', async () => {
      await openAtEdgeUnderFinger();
      fake.resize();
      runRefitFrame();
      expect(pansRequested()).toEqual([]);
      fake.resize();
      runRefitFrame();
      expect(pansRequested())
        .withContext('a second resize under the same finger still pans nothing')
        .toEqual([]);
    });

    it('pans normally on a later resize once the finger has come up', async () => {
      await openAtEdgeUnderFinger();
      fake.resize();
      runRefitFrame();
      expect(pansRequested()).toEqual([]);
      fake.release();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
      expect(pansRequested()[0]?.options.offset?.[0]).toBeLessThan(0);
    });

    it('pans normally on a later resize once the browser has cancelled the touch', async () => {
      await openAtEdgeUnderFinger();
      fake.resize();
      runRefitFrame();
      fake.cancelTouch();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
    });

    it('pans normally on a later resize once the button was let go off the map', async () => {
      await openAtEdgeUnderFinger();
      fake.resize();
      runRefitFrame();
      fake.releaseOutsideMap();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
    });

    it('keeps holding the map while one of two fingers is still down', async () => {
      await openAtEdgeUnderFinger();
      // A second finger goes down and comes up; the first is still resting.
      fake.canvasContainer.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 8, bubbles: true }),
      );
      document.body.dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 8, bubbles: true }),
      );
      fake.resize();
      runRefitFrame();
      expect(pansRequested()).toEqual([]);
    });

    it('does not count a finger that went down on a control or popup rather than the map', async () => {
      await openAtEdgeUnderFinger();
      fake.release();
      popups[0]
        ?.getElement()
        .dispatchEvent(
          new PointerEvent('pointerdown', { pointerId: 9, bubbles: true }),
        );
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length).toBe(1);
    });

    it('re-fits a popup still waiting on its pan without panning, and reveals it once when that settles', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      createController();
      fake.projected = { x: 20, y: 500 };
      await tap('a');
      expect(popups[0]?.isPending())
        .withContext('a is still panning')
        .toBe(true);
      fake.touchDown();
      fake.resize();
      runRefitFrame();
      expect(pansRequested().length)
        .withContext("a re-fit pan would replace the visitor's hold on the map")
        .toBe(1);
      expect(popups[0]?.isPending())
        .withContext("still waiting on the pan's end")
        .toBe(true);
      fake.emit('moveend');
      expect(popups[0]?.isPending()).toBe(false);
      fake.emit('moveend');
      expect(popups[0]?.getElement().getAnimations().length)
        .withContext('revealed exactly once')
        .toBe(1);
    });

    it('swaps the popup to the other side without panning it, even when the drag ends before it is fitted', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      createController();
      fake.projected = { x: 500, y: 40 };
      fake.grab();
      await tap('a');
      expect(popups[0]?.options.anchor).toBe('top');
      // The pin ends up in the corner, off the side the popup opened on, as the drag goes on.
      fake.drag();
      fake.projected = { x: 20, y: 560 };
      fake.resize();
      runRefitFrame();
      await settle();
      expect(popups[1]?.options.anchor).toBe('bottom');
      expect(popups[1]?.isPending())
        .withContext('the swapped popup waits for the drag to end')
        .toBe(true);
      fake.release();
      expect(pansRequested())
        .withContext('the visitor held the map when it was swapped: no pan')
        .toEqual([]);
      expect(popups[1]?.isPending()).toBe(false);
    });

    it('does not pan a swapped popup in when the visitor lets go while it is still loading', async () => {
      requestReducedMotion(false);
      holdAnimationFrames();
      createController();
      fake.projected = { x: 500, y: 40 };
      fake.grab();
      await tap('a');
      expect(popups[0]?.options.anchor).toBe('top');
      const letThrough = holdPopupFactory();
      fake.projected = { x: 20, y: 560 };
      fake.resize();
      runRefitFrame();
      // The visitor lifts the finger after the swap began: nothing holds the map by the time the
      // swapped popup is fitted, so only the hold seen at the swap keeps it from panning.
      fake.release();
      await letThrough();
      expect(popups[1]?.options.anchor).toBe('bottom');
      expect(pansRequested())
        .withContext('the visitor held the map when it was swapped: no pan')
        .toEqual([]);
      expect(popups[1]?.isPending()).toBe(false);
    });
  });

  it('fits a popup against the camera as it is once maplibre-gl has loaded, not as it was at the tap', async () => {
    requestReducedMotion(false);
    createController();
    const letThrough = holdPopupFactory();
    fake.projected = { x: 500, y: 300 };
    fake.emit('click', tapOn('a'), 'spots-hit');
    // The visitor drags the pin into the corner while the popup's chunk is still loading.
    fake.projected = { x: 20, y: 500 };
    await letThrough();
    expect(popups[0]?.addedTo).toBeTruthy();
    expect(pansRequested().length)
      .withContext(
        'the pin is at the edge now, so the popup is panned into view',
      )
      .toBe(1);
    expect(pansRequested()[0]?.options.offset?.[0]).toBeLessThan(0);
    expect(popups[0]?.isPending()).toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
  });

  it('swaps to the other side when the camera moved the pin off the side it was created for while loading', async () => {
    requestReducedMotion(true);
    createController();
    const letThrough = holdPopupFactory();
    fake.projected = { x: 500, y: 40 };
    fake.emit('click', tapOn('a'), 'spots-hit');
    fake.projected = { x: 500, y: 560 };
    await letThrough();
    await flushPending();
    expect(popups[0]?.options.anchor).toBe('top');
    expect(popups.length).toBe(2);
    expect(popups[1]?.options.anchor).toBe('bottom');
    expect(popups[0]?.removed)
      .withContext('the never-shown first popup is gone at once')
      .toBe(true);
    expect(fake.featureStates['a']?.['selected'])
      .withContext('the pin stays selected through the swap')
      .toBe(true);
  });

  it('drops a popup waiting for the camera to settle when another pin is tapped, revealing only the newest', async () => {
    requestReducedMotion(false);
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    await tap('b');
    await tap('a');
    await flushPending();
    expect(popups.length).toBe(3);
    expect(popups[1]?.removed)
      .withContext('b was dropped before it was ever shown')
      .toBe(true);
    fake.emit('moveend');
    expect(popups[1]?.getElement().getAnimations().length)
      .withContext('b is never revealed')
      .toBe(0);
    expect(pansRequested().length)
      .withContext("the newest popup is fitted once, after a's ease")
      .toBe(2);
    fake.emit('moveend');
    expect(popups[2]?.isPending()).toBe(false);
    expect(popups[2]?.getElement().getAnimations().length).toBe(1);
  });

  it('leaves a popup waiting for the camera to settle unfitted and unrevealed once its pin is deselected', async () => {
    createController();
    fake.startMove();
    await tap('a');
    controller!.close();
    await flushPending();
    fake.emit('moveend');
    expect(popups[0]?.getElement().getAnimations().length).toBe(0);
    expect(pansRequested()).toEqual([]);
    expect(popups[0]?.removed).toBe(true);
  });

  it('reveals a pending popup once, when a resize re-fit pan that interrupted its pan settles', async () => {
    holdAnimationFrames();
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    expect(popups[0]?.isPending()).withContext('a is still panning').toBe(true);
    fake.emit('resize');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    expect(fake.cameraMoves.filter((move) => move.method === 'panBy').length)
      .withContext('the re-fit pans the popup back into view')
      .toBe(2);
    expect(popups[0]?.isPending())
      .withContext("the re-fit pan's interruption does not reveal a")
      .toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending())
      .withContext('revealed when the re-fit pan settles')
      .toBe(false);
    fake.emit('moveend');
    expect(popups[0]?.getElement().getAnimations().length)
      .withContext('revealed exactly once')
      .toBe(1);
  });

  it('eases an edge pan under reduced motion and reveals the popup when it settles', async () => {
    requestReducedMotion(true);
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    const pans = fake.cameraMoves.filter((move) => move.method === 'panBy');
    expect(pans.map((move) => move.options.duration)).toEqual([200]);
    expect(pans[0]?.options.essential)
      .withContext('MapLibre would otherwise jump instead of easing')
      .toBe(true);
    expect(popups[0]?.isPending())
      .withContext('hidden while the shortened pan runs')
      .toBe(true);
    fake.emit('moveend');
    expect(popups[0]?.isPending()).toBe(false);
  });

  it('reveals the popup once when its pan ends before panBy returns', async () => {
    createController();
    fake.projected = { x: 20, y: 500 };
    // Any zero-duration path: the pan finishes, firing its `moveend`, inside `panBy`.
    fake.jumps = true;
    await tap('a');
    expect(popups[0]?.isPending())
      .withContext('revealed although its moveend has already fired')
      .toBe(false);
    fake.emit('moveend');
    expect(popups[0]?.getElement().getAnimations().length)
      .withContext('revealed exactly once')
      .toBe(1);
  });

  it('reveals a pending popup once when a resize re-fit pan ends before panBy returns', async () => {
    holdAnimationFrames();
    createController();
    fake.projected = { x: 20, y: 500 };
    await tap('a');
    expect(popups[0]?.isPending()).withContext('a is still panning').toBe(true);
    // Any zero-duration path: the pan finishes, firing its `moveend`, inside `panBy`.
    fake.jumps = true;
    fake.emit('resize');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    expect(fake.cameraMoves.filter((move) => move.method === 'panBy').length)
      .withContext('the re-fit pans the popup back into view')
      .toBe(2);
    expect(popups[0]?.isPending())
      .withContext('revealed although the re-fit pan has already ended')
      .toBe(false);
    fake.emit('moveend');
    expect(popups[0]?.getElement().getAnimations().length)
      .withContext('revealed exactly once')
      .toBe(1);
  });

  it('caps a tall popup and tells it to scroll', async () => {
    const notes = 'A long ledge along the canal, waxed every summer. '.repeat(
      40,
    );
    createController({
      collection: {
        type: 'FeatureCollection',
        features: [
          {
            ...COLLECTION.features[0],
            properties: { ...COLLECTION.features[0]?.properties, notes },
          },
        ],
      },
    });
    host.style.height = '150px';
    fake.projected = { x: 500, y: 75 };
    await tap('a');
    const element = popups[0]?.getElement();
    expect(element?.style.getPropertyValue('--spot-popup-max-height')).toMatch(
      /^\d+(\.\d+)?px$/,
    );
    expect(popups[0]?.content?.querySelector('.spot-popup__body--more'))
      .withContext('the capped body says more is below')
      .toBeTruthy();
  });

  it("starts the old popup's close at once when another pin is tapped", async () => {
    createController();
    await tap('a');
    expect(popups[0]?.isPending()).withContext('a was revealed').toBe(false);
    await tap('b');
    expect(popups[1]).withContext('b exists').toBeDefined();
    expect(popups[0]?.removed).toBe(false);
    expect(
      popups[0]
        ?.getElement()
        .getAnimations()
        .some((animation) => animation.playState === 'running'),
    )
      .withContext('a is already playing its close')
      .toBe(true);
  });

  it('swaps the popup to the other side when its side runs out of room on a resize', async () => {
    requestReducedMotion(true);
    holdAnimationFrames();
    createController();
    fake.projected = { x: 500, y: 40 };
    await tap('a');
    expect(popups[0]?.options.anchor).toBe('top');
    fake.projected = { x: 500, y: 560 };
    fake.emit('resize');
    const frames = window.requestAnimationFrame as jasmine.Spy;
    (frames.calls.mostRecent().args[0] as FrameRequestCallback)(0);
    await settle();
    expect(popups[0]?.removed)
      .withContext('a is closing, not gone')
      .toBe(false);
    expect(popups[0]?.getElement().getAnimations().length)
      .withContext('a is playing its close')
      .toBeGreaterThan(0);
    expect(popups.length).toBe(2);
    expect(popups[1]?.options.anchor).toBe('bottom');
  });

  it('puts the pin back when the popup cannot be built', async () => {
    createController();
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    popupFactoryRejects = true;
    await tap('a');
    expect(appRef.viewCount)
      .withContext('the popup view was released')
      .toBe(baseline);
    expect(fake.featureStates['a']?.['selected']).toBeUndefined();
  });

  it('ignores a tap that carries no spot of its own', async () => {
    createController();
    fake.emit('click', { features: [] }, 'spots-hit');
    await settle();
    expect(popups.length).toBe(0);
  });

  it('pulses a lock-on onto the pin it selects', async () => {
    requestReducedMotion(false);
    holdAnimationFrames();
    createController();
    await tap('a');
    expect(fake.lastLockOnFilter())
      .withContext('the ring is on the tapped pin alone')
      .toEqual(onlySpot('a'));
    expect(fake.lastLockOnPaint('circle-radius'))
      .withContext('the ring starts wide of the pin')
      .toBe(34);
    expect(fake.lastLockOnPaint('circle-stroke-opacity')).toBe(1);
  });

  it('starts a fresh lock-on when the selection moves to another pin', async () => {
    requestReducedMotion(false);
    const cancelFrame = holdAnimationFrames();
    createController();
    await tap('a');
    const before = fake.paintCalls.length;
    await tap('b');
    const moved = fake.paintCalls
      .slice(before)
      .filter((call) => call.layer === 'spots-lock-on');
    expect(cancelFrame)
      .withContext('the first pulse was stopped')
      .toHaveBeenCalled();
    expect(moved.map((call) => call.value))
      .withContext('the first pulse was put to rest before the second began')
      .toContain(LOCK_ON_AT_REST);
    expect(fake.lastLockOnPaint('circle-radius')).toBe(34);
    expect(fake.lastLockOnFilter())
      .withContext('the ring moved to the newly tapped pin')
      .toEqual(onlySpot('b'));
  });

  it('stops the lock-on when the popup closes', async () => {
    requestReducedMotion(false);
    const cancelFrame = holdAnimationFrames();
    createController();
    await tap('a');
    popups[0]?.content
      ?.querySelector<HTMLElement>('.spot-popup__close')
      ?.click();
    expect(cancelFrame).toHaveBeenCalled();
    expect(fake.lastLockOnPaint('circle-radius')).toBe(11.5);
    expect(fake.lastLockOnPaint('circle-stroke-opacity')).toEqual(
      LOCK_ON_AT_REST,
    );
    expect(fake.lastLockOnFilter())
      .withContext('the resting ring matches no pin')
      .toBe(LOCK_ON_AT_REST_FILTER);
  });

  it('skips the lock-on under reduced motion, keeping the ring', async () => {
    requestReducedMotion(true);
    holdAnimationFrames();
    createController();
    await tap('a');
    // The paint record is the witness, not `requestAnimationFrame`: Angular's change-detection
    // scheduler asks for frames of its own on every tap. lock-on-pulse.spec.ts pins the pulse
    // itself asking for none.
    expect(
      fake.paintCalls.filter((call) => call.layer === 'spots-lock-on'),
    ).toEqual([]);
    expect(fake.filterCalls).toEqual([]);
    expect(fake.featureStates['a']?.['selected']).toBe(true);
  });
});
