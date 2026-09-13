import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';

import { CityEnum, MapFailureReason } from '../../../models/enums/map-enum';
import { GmapsEmbedComponent } from '../gmaps-embed/gmaps-embed.component';
import { MAP_FACTORY, POPUP_FACTORY } from '../spot-map/map-factory.token';
import { SpotMapComponent } from '../spot-map/spot-map.component';
import { MapContainerComponent } from './map-container.component';

// Mirror the private timing constants in map-container.component.ts.
const LOAD_TIMEOUT_MS = 15_000;
const REVEAL_DELAY_MS = 700;

/**
 * SpotMapComponent injects both maplibre factories the moment it is constructed. These
 * tests never let it call either one (the spot request below is never flushed), so a
 * never-resolving stub is enough — and providing them keeps the ESM-only maplibre-gl out
 * of the karma bundle, which is why neither token carries a default (map-factory.token.ts).
 */
const neverResolves = () => new Promise<never>(() => {});

describe('MapContainerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapContainerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAP_FACTORY, useValue: neverResolves },
        { provide: POPUP_FACTORY, useValue: neverResolves },
      ],
    }).compileComponents();

    // The container owns the state machine, not the embed. Blank the renderer's
    // template so these tests never open a live Google iframe; the embed's own
    // markup is covered by gmaps-embed.component.spec.ts.
    TestBed.overrideComponent(GmapsEmbedComponent, { set: { template: '' } });
    // Same for the MapLibre renderer: no WebGL context is built here either, and its
    // own markup is covered by spot-map.component.spec.ts.
    TestBed.overrideComponent(SpotMapComponent, { set: { template: '' } });
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

  // The state signals and renderer callbacks are protected; reach them through a
  // cast in tests only.
  const failure = (c: MapContainerComponent) =>
    (
      c as unknown as { failureReason: () => MapFailureReason | null }
    ).failureReason();
  const errorShown = (c: MapContainerComponent) => failure(c) !== null;
  const mapShown = (c: MapContainerComponent) =>
    (c as unknown as { mapReady: () => boolean }).mapReady();
  const rendererReady = (c: MapContainerComponent) =>
    (c as unknown as { onRendererReady: () => void }).onRendererReady();
  const rendererFailed = (c: MapContainerComponent, reason: MapFailureReason) =>
    (
      c as unknown as { onRendererFailed: (reason: MapFailureReason) => void }
    ).onRendererFailed(reason);

  it('should create', () => {
    const fixture = create(true);
    expect(fixture.componentInstance).toBeTruthy();
    fixture.destroy();
  });

  it('renders the maplibre renderer for a city configured to use it', () => {
    const fixture = create(true, CityEnum.Vienna);
    expect(fixture.nativeElement.querySelector('app-spot-map')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-gmaps-embed')).toBeNull();
    fixture.destroy();
  });

  it('renders the google embed for a city configured to use it', () => {
    const fixture = create(true, CityEnum.Graz);
    expect(fixture.nativeElement.querySelector('app-gmaps-embed')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-spot-map')).toBeNull();
    fixture.destroy();
  });

  it('shows SIGNAL LOST after the load timeout elapses with no load event', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    expect(errorShown(c)).toBe(false);
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);
    expect(failure(c)).toBe('unreachable');
    expect(mapShown(c)).toBe(false);
    fixture.destroy();
  }));

  it('cancels the unreachable timeout on load, then reveals the map', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    rendererReady(c);
    tick(LOAD_TIMEOUT_MS); // well past both the (cancelled) timeout and the reveal delay
    expect(errorShown(c)).toBe(false);
    expect(mapShown(c)).toBe(true);
    fixture.destroy();
  }));

  it('does not let a stale pre-retry reveal mark the retried map as loaded', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    // 1. original navigation never loads -> SIGNAL LOST
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);
    // 2. the slow original renderer finally reports ready, scheduling a reveal...
    rendererReady(c);
    // 3. ...but the user hits RETRY within the reveal window
    c.retry();
    expect(errorShown(c)).toBe(false);
    expect(mapShown(c)).toBe(false);
    // 4. the stale reveal must NOT fire over the not-yet-loaded retried content
    tick(REVEAL_DELAY_MS);
    expect(mapShown(c)).toBe(false);
    // 5. a genuine second failure still re-shows SIGNAL LOST
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);
    fixture.destroy();
  }));

  it('re-arms the loading/error/timeout state machine when the city changes', fakeAsync(() => {
    // Empty template so detectChanges() flushes the city effect without a real
    // (network-loading) renderer interfering with the virtual clock.
    TestBed.overrideComponent(MapContainerComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(MapContainerComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.detectChanges(); // effect's first run consumes the initial city
    const c = fixture.componentInstance;

    // First city loads and reveals.
    rendererReady(c);
    tick(REVEAL_DELAY_MS);
    expect(mapShown(c)).toBe(true);
    expect(errorShown(c)).toBe(false);

    // Switch to a different city on the SAME instance: the overlay must return
    // (no stale "loaded" frame / white flash) and no error should show yet.
    fixture.componentRef.setInput('city', CityEnum.Graz);
    fixture.detectChanges(); // flush the effect -> resetForNewCity()
    expect(mapShown(c)).toBe(false);
    expect(errorShown(c)).toBe(false);

    // The new city hangs -> its own fresh watchdog still surfaces SIGNAL LOST.
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);
    expect(mapShown(c)).toBe(false);
    fixture.destroy();
  }));

  it('cancels pending timers on destroy', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    rendererReady(c); // schedules a reveal
    fixture.destroy();
    tick(LOAD_TIMEOUT_MS + REVEAL_DELAY_MS); // nothing should fire post-destroy
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
    expect(fixture.nativeElement.textContent).toContain('NO RENDERER');
    expect(fixture.nativeElement.querySelector('.map-error__retry')).toBeNull();
    fixture.destroy();
  });
});
