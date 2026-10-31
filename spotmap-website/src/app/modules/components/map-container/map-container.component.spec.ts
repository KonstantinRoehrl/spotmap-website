import { Component } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { CityEnum } from '../../../models/enums/map-enum';
import { MapLoaderComponent } from '../map-loader/map-loader.component';
import {
  INITIAL_MAP_LOAD_STATE,
  MapLoadState,
} from '../map-loader/map-load-progress';
import type { MapFailureReason } from '../../../models/map/map-failure-reason';
import type { MapLoadEvent } from '../../../models/map/map-load-event';
import {
  LOAD_TIMEOUT_MS,
  MapContainerComponent,
} from './map-container.component';

describe('MapContainerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapContainerComponent],
    }).compileComponents();
  });

  /** Create + bind the required input. Pass `render` to also run change detection. */
  function create(
    render = false,
    city: CityEnum = CityEnum.Vienna,
  ): ComponentFixture<MapContainerComponent> {
    const fixture = TestBed.createComponent(MapContainerComponent);
    fixture.componentRef.setInput('city', city);
    if (render) {
      fixture.detectChanges();
    }
    return fixture;
  }

  // The state signals and the RETRY handler are protected; reach them through a
  // cast in tests only.
  const failure = (c: MapContainerComponent) =>
    (
      c as unknown as { failureReason: () => MapFailureReason | null }
    ).failureReason();
  const errorShown = (c: MapContainerComponent) => failure(c) !== null;
  const mapShown = (c: MapContainerComponent) =>
    (c as unknown as { mapReady: () => boolean }).mapReady();
  const rendererReady = (c: MapContainerComponent) => c.onReady();
  const rendererFailed = (c: MapContainerComponent, reason: MapFailureReason) =>
    c.onFailed(reason);
  const applyEvent = (c: MapContainerComponent, event: MapLoadEvent) =>
    c.report(event);
  const clickRetry = (c: MapContainerComponent) =>
    (c as unknown as { onRetryClick: () => void }).onRetryClick();
  const barFinished = (c: MapContainerComponent) =>
    (c as unknown as { onBarFinished: () => void }).onBarFinished();
  const loadState = (c: MapContainerComponent) =>
    (c as unknown as { loadState: () => MapLoadState }).loadState();
  const loaderOf = (fixture: ComponentFixture<MapContainerComponent>) =>
    (fixture.debugElement.query(By.directive(MapLoaderComponent))
      ?.componentInstance ?? null) as MapLoaderComponent | null;

  /** What the browser paints for `token` on `property`, resolved the same way as the element's. */
  function painted(property: 'color' | 'text-shadow', token: string): string {
    const probe = document.createElement('span');
    probe.style.setProperty(property, token);
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return value;
  }

  it('shows the failure in the Standard tier with a pointer-bloom RETRY', () => {
    const fixture = create(true);
    rendererFailed(fixture.componentInstance, 'unreachable');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(
      getComputedStyle(host.querySelector('.map-error__line')!).textShadow,
    ).toBe(painted('text-shadow', 'var(--glow-text-standard)'));
    expect(host.querySelector('.map-error__retry')!.classList).toContain(
      'phosphor-bloom',
    );
    fixture.destroy();
  });

  it('should create', () => {
    const fixture = create(true);
    expect(fixture.componentInstance).toBeTruthy();
    fixture.destroy();
  });

  it('fades the map in over the same crossfade as the loader leaving', () => {
    const fixture = create(true);
    const host = fixture.nativeElement as HTMLElement;
    const frame = getComputedStyle(host.querySelector('.map-frame')!);
    const overlay = getComputedStyle(
      host.querySelector('.map-container__overlay')!,
    );
    expect(frame.transitionDuration).toBe(overlay.transitionDuration);
    expect(overlay.transitionDuration).toBe('0.3s');
    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--dur-crossfade')
        .trim(),
    ).toBe('300ms');
    fixture.destroy();
  });

  /**
   * Replaces the animation-frame clock with one the test drives. `flush` runs every callback that
   * has not been cancelled, as the browser would on its next frame.
   */
  function stubAnimationFrames() {
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      pending.set(nextId, callback);
      return nextId++;
    });
    spyOn(window, 'cancelAnimationFrame').and.callFake((id) => {
      pending.delete(id);
    });
    return {
      flush: () => {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach((callback) => callback(performance.now()));
      },
    };
  }
  const statusOf = (fixture: ComponentFixture<MapContainerComponent>) =>
    fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;

  it('has the status region in place and empty until a frame has been painted, then announces the first step', () => {
    const frames = stubAnimationFrames();
    const fixture = create(true);
    const status = statusOf(fixture);
    expect(status).toBeTruthy();
    // A live region announces changes made after it exists, not what it was inserted with.
    expect(status.textContent?.trim()).toBe('');

    // Further change detection in the same frame must not speak yet: the region has to survive a
    // painted frame empty. (No whenStable: the load watchdog's timer would keep the fixture
    // unstable for its whole 15 s.)
    fixture.detectChanges();
    expect(status.textContent?.trim()).toBe('');

    frames.flush();
    fixture.detectChanges();
    expect(statusOf(fixture)).toBe(status);
    expect(status.textContent?.trim()).toBe('Loading spots for Vienna');
    fixture.destroy();
  });

  it('cancels the pending first announcement when destroyed before the frame', () => {
    const frames = stubAnimationFrames();
    const fixture = create(true);
    const c = fixture.componentInstance;
    fixture.destroy();
    frames.flush();
    expect(
      (c as unknown as { announcement: () => string }).announcement(),
    ).toBe('');
  });

  it('keeps the status region empty once the map shows or the load has failed', () => {
    const frames = stubAnimationFrames();
    const fixture = create(true);
    frames.flush();
    fixture.detectChanges();
    expect(statusOf(fixture).textContent?.trim()).toBe(
      'Loading spots for Vienna',
    );

    rendererFailed(fixture.componentInstance, 'unreachable');
    fixture.detectChanges();
    expect(statusOf(fixture).textContent?.trim()).toBe('');
    fixture.destroy();
  });

  it('announces a later load at once, without waiting for another frame', () => {
    const frames = stubAnimationFrames();
    const fixture = create(true);
    frames.flush();
    fixture.detectChanges();

    fixture.componentRef.setInput('city', CityEnum.Graz);
    fixture.detectChanges();
    expect(statusOf(fixture).textContent?.trim()).toBe(
      'Loading spots for Graz',
    );

    rendererFailed(fixture.componentInstance, 'unreachable');
    clickRetry(fixture.componentInstance);
    fixture.detectChanges();
    expect(statusOf(fixture).textContent?.trim()).toBe(
      'Loading spots for Graz',
    );
    fixture.destroy();
  });

  it('names the archive copy, then the map, then the drawing', () => {
    const frames = stubAnimationFrames();
    const fixture = create(true);
    frames.flush();
    const c = fixture.componentInstance;
    const statusText = () => statusOf(fixture)?.textContent?.trim();

    applyEvent(c, { kind: 'spots-fallback' });
    fixture.detectChanges();
    expect(statusText()).toBe('Using the archive copy for Vienna');

    applyEvent(c, { kind: 'spots-done' });
    fixture.detectChanges();
    expect(statusText()).toBe('Loading the map of Vienna');

    applyEvent(c, { kind: 'painted' });
    fixture.detectChanges();
    expect(statusText()).toBe('Drawing the map');
    fixture.destroy();
  });

  it('passes the city and the load state to the loader', () => {
    const fixture = create(true);
    const c = fixture.componentInstance;
    applyEvent(c, { kind: 'spots-done' });
    fixture.detectChanges();
    const loader = loaderOf(fixture);
    expect(loader).toBeTruthy();
    expect(loader?.city()).toBe('vienna');
    expect(loader?.state().progress).toBe(0.3);
    fixture.destroy();
  });

  it('reveals the map when the bar has finished', () => {
    const fixture = create(true);
    const c = fixture.componentInstance;
    applyEvent(c, { kind: 'painted' });
    rendererReady(c);
    barFinished(c);
    fixture.detectChanges();
    expect(mapShown(c)).toBe(true);
    expect(errorShown(c)).toBe(false);
    expect(loaderOf(fixture)).toBeNull();
    fixture.destroy();
  });

  it('never reveals on a timer before the watchdog', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    applyEvent(c, { kind: 'painted' });
    rendererReady(c);
    tick(LOAD_TIMEOUT_MS - 1);
    expect(mapShown(c)).toBe(false);
    expect(errorShown(c)).toBe(false);
    fixture.destroy();
  }));

  it('shows SIGNAL LOST when nothing has painted by the timeout', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    expect(errorShown(c)).toBe(false);
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);
    expect(failure(c)).toBe('unreachable');
    expect(mapShown(c)).toBe(false);
    fixture.destroy();
  }));

  it('reveals instead of failing when the watchdog fires after the paint', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    applyEvent(c, { kind: 'painted' });
    tick(LOAD_TIMEOUT_MS);
    expect(mapShown(c)).toBe(true);
    expect(errorShown(c)).toBe(false);
    fixture.destroy();
  }));

  it('folds load events behind a failure without changing the chrome', () => {
    const fixture = create(true);
    rendererFailed(fixture.componentInstance, 'unreachable');
    fixture.detectChanges();
    applyEvent(fixture.componentInstance, { kind: 'spots-done' });
    applyEvent(fixture.componentInstance, { kind: 'painted' });
    fixture.detectChanges();
    expect(errorShown(fixture.componentInstance)).toBeTrue();
    expect(mapShown(fixture.componentInstance)).toBeFalse();
    expect(loadState(fixture.componentInstance).step).toBe('draw');
    expect(fixture.nativeElement.querySelector('app-map-loader')).toBeNull();
    fixture.destroy();
  });

  it('replaces SIGNAL LOST with the map when its pins arrive after the watchdog', fakeAsync(() => {
    const fixture = create(true);
    tick(LOAD_TIMEOUT_MS);
    fixture.detectChanges();
    expect(errorShown(fixture.componentInstance)).toBeTrue();
    applyEvent(fixture.componentInstance, { kind: 'painted' });
    rendererReady(fixture.componentInstance);
    fixture.detectChanges();
    expect(errorShown(fixture.componentInstance)).toBeFalse();
    expect(mapShown(fixture.componentInstance)).toBeTrue();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('app-map-loader'))
      .withContext('no loader in between')
      .toBeNull();
    expect(
      host.querySelector('.map-container')!.getAttribute('aria-busy'),
    ).toBe('false');
    expect(statusOf(fixture).textContent).toBe('');
    fixture.destroy();
  }));

  it('keeps SIGNAL LOST through a late paint until the pins are drawn', fakeAsync(() => {
    const fixture = create(true);
    tick(LOAD_TIMEOUT_MS);
    applyEvent(fixture.componentInstance, { kind: 'painted' });
    fixture.detectChanges();
    expect(errorShown(fixture.componentInstance)).toBeTrue();
    expect(mapShown(fixture.componentInstance)).toBeFalse();
    fixture.destroy();
  }));

  it('keeps the renderer’s reason when it fails after the watchdog', fakeAsync(() => {
    const fixture = create(true);
    tick(LOAD_TIMEOUT_MS);
    rendererFailed(fixture.componentInstance, 'unsupported');
    expect(failure(fixture.componentInstance)).toBe('unsupported');
    fixture.destroy();
  }));

  it('runs a normal load through the bar, not the late path', () => {
    const fixture = create(true);
    applyEvent(fixture.componentInstance, { kind: 'painted' });
    rendererReady(fixture.componentInstance);
    fixture.detectChanges();
    expect(mapShown(fixture.componentInstance))
      .withContext('only the bar finishing reveals a healthy load')
      .toBeFalse();
    fixture.destroy();
  });

  it('resets progress on retry', fakeAsync(() => {
    const fixture = create(true);
    const c = fixture.componentInstance;
    applyEvent(c, { kind: 'spots-done' });
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);

    clickRetry(c);
    expect(errorShown(c)).toBe(false);
    expect(mapShown(c)).toBe(false);
    expect(loadState(c)).toEqual(INITIAL_MAP_LOAD_STATE);
    // The loader is back, drawing the retried load (which has only just re-sent its request).
    fixture.detectChanges();
    expect(loaderOf(fixture)?.state().step).toBe('spots');

    // The retried load gets a fresh watchdog, and the pre-retry events do not count as a paint.
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);
    fixture.destroy();
  }));

  it('resets the load when the city changes', fakeAsync(() => {
    // Empty template so detectChanges() flushes the city effect without a real
    // (network-loading) renderer interfering with the virtual clock.
    TestBed.overrideComponent(MapContainerComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(MapContainerComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.detectChanges(); // effect's first run consumes the initial city
    const c = fixture.componentInstance;

    // First city paints and reveals.
    applyEvent(c, { kind: 'painted' });
    rendererReady(c);
    barFinished(c);
    expect(mapShown(c)).toBe(true);

    // Switch to a different city on the SAME instance: the loader must return
    // (no stale "loaded" frame) with its progress back at the start.
    fixture.componentRef.setInput('city', CityEnum.Graz);
    fixture.detectChanges(); // flush the effect -> resetForNewCity()
    expect(mapShown(c)).toBe(false);
    expect(errorShown(c)).toBe(false);
    expect(loadState(c)).toEqual(INITIAL_MAP_LOAD_STATE);

    // The new city hangs -> its own fresh watchdog surfaces SIGNAL LOST, since
    // the previous city's paint no longer counts.
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);
    expect(mapShown(c)).toBe(false);
    fixture.destroy();
  }));

  it('cancels the watchdog on destroy', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    fixture.destroy();
    tick(LOAD_TIMEOUT_MS); // nothing should fire post-destroy
    expect(errorShown(c)).toBe(false);
    expect(mapShown(c)).toBe(false);
  }));

  it('offers RETRY for an unreachable failure', () => {
    const fixture = create(true);
    const c = fixture.componentInstance;
    rendererFailed(c, 'unreachable');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('SIGNAL LOST');
    expect(
      fixture.nativeElement.querySelector('.map-error__retry'),
    ).toBeTruthy();
    fixture.destroy();
  });

  it('withholds RETRY for an unsupported renderer', () => {
    const fixture = create(true);
    const c = fixture.componentInstance;
    rendererFailed(c, 'unsupported');
    fixture.detectChanges();
    expect(failure(c)).toBe('unsupported');
    // The condition is a browser without WebGL 2, which is what MapLibre needs — so the line may
    // not claim the browser has no WebGL at all: an iOS 14 Safari, the browser this path exists
    // for, has WebGL 1 and would be told something false. It says what the reader can act on
    // instead of a version number they cannot.
    expect(fixture.nativeElement.textContent).toContain(
      '> NO RENDERER // THIS BROWSER CANNOT DRAW THE MAP',
    );
    expect(fixture.nativeElement.querySelector('.map-error__retry')).toBeNull();
    fixture.destroy();
  });

  /** A frame around projected content, as the page uses it. */
  @Component({
    imports: [MapContainerComponent],
    template: `<app-map-container [city]="city"
      ><p class="projected">the map</p></app-map-container
    >`,
  })
  class FrameHostComponent {
    city = CityEnum.Vienna;
  }

  it('renders what is projected into it inside the fading frame', () => {
    const fixture = TestBed.createComponent(FrameHostComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.map-frame .projected')).not.toBeNull();
    fixture.destroy();
  });

  it('folds the store’s milestones and then the map’s events, in that order', () => {
    const fixture = create();
    fixture.componentRef.setInput('spotEvents', [
      { kind: 'spots-sent' },
      { kind: 'spots-fallback' },
      { kind: 'spots-sent' },
      { kind: 'spots-done' },
    ]);
    fixture.detectChanges();
    applyEvent(fixture.componentInstance, { kind: 'renderer-ready' });
    const state = loadState(fixture.componentInstance);
    expect(state.step).toBe('map');
    expect(state.fallback).toBeTrue();
    fixture.destroy();
  });

  it('shows the failure for a failed list and stops the watchdog', fakeAsync(() => {
    const fixture = create(true);
    fixture.componentRef.setInput('listFailed', true);
    fixture.detectChanges();
    expect(failure(fixture.componentInstance)).toBe('unreachable');
    fixture.componentRef.setInput('listFailed', false);
    fixture.detectChanges();
    tick(LOAD_TIMEOUT_MS);
    expect(failure(fixture.componentInstance))
      .withContext('the watchdog stood down when the list failed')
      .toBeNull();
    fixture.destroy();
  }));

  it('prefers the map’s unsupported over a failed list, so RETRY stays withheld', () => {
    const fixture = create(true);
    rendererFailed(fixture.componentInstance, 'unsupported');
    fixture.componentRef.setInput('listFailed', true);
    fixture.detectChanges();
    expect(failure(fixture.componentInstance)).toBe('unsupported');
    expect(fixture.nativeElement.querySelector('.map-error__retry')).toBeNull();
    fixture.destroy();
  });

  it('emits retry and resets its own load on a RETRY click', () => {
    const fixture = create(true);
    const retried = jasmine.createSpy('retry');
    fixture.componentInstance.retry.subscribe(retried);
    applyEvent(fixture.componentInstance, { kind: 'painted' });
    rendererFailed(fixture.componentInstance, 'unreachable');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.map-error__retry').click();
    expect(retried).toHaveBeenCalledTimes(1);
    expect(errorShown(fixture.componentInstance)).toBeFalse();
    expect(loadState(fixture.componentInstance).progress).toBe(0);
    fixture.destroy();
  });
});
