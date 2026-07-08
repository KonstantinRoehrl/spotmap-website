import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';

import { CityEnum } from '../../../models/enums/map-enum';
import { MapContainerComponent } from './map-container.component';

// Mirror the private timing constants in map-container.component.ts.
const LOAD_TIMEOUT_MS = 15_000;
const REVEAL_DELAY_MS = 700;

describe('MapContainerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapContainerComponent],
    }).compileComponents();
  });

  /** Create + bind the required input. Pass `render` to also run change detection. */
  function create(render = false): ComponentFixture<MapContainerComponent> {
    const fixture = TestBed.createComponent(MapContainerComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    if (render) {
      fixture.detectChanges();
    }
    return fixture;
  }

  // The state signals are protected; read them through a cast in tests only.
  const errorShown = (c: MapContainerComponent) =>
    (c as unknown as { loadError: () => boolean }).loadError();
  const mapShown = (c: MapContainerComponent) =>
    (c as unknown as { iframeLoaded: () => boolean }).iframeLoaded();

  it('should create', () => {
    const fixture = create(true);
    expect(fixture.componentInstance).toBeTruthy();
    fixture.destroy();
  });

  it('exposes a sanitized url for the selected city', () => {
    const fixture = create(true);
    expect(fixture.componentInstance.safeUrl()).toBeTruthy();
    fixture.destroy();
  });

  it('shows SIGNAL LOST after the load timeout elapses with no load event', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    expect(errorShown(c)).toBe(false);
    tick(LOAD_TIMEOUT_MS);
    expect(errorShown(c)).toBe(true);
    expect(mapShown(c)).toBe(false);
    fixture.destroy();
  }));

  it('cancels the unreachable timeout on load, then reveals the map', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.onIframeLoad();
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
    // 2. the slow original iframe finally fires load, scheduling a reveal...
    c.onIframeLoad();
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

  it('cancels pending timers on destroy', fakeAsync(() => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.onIframeLoad(); // schedules a reveal
    fixture.destroy();
    tick(LOAD_TIMEOUT_MS + REVEAL_DELAY_MS); // nothing should fire post-destroy
    expect(errorShown(c)).toBe(false);
    expect(mapShown(c)).toBe(false);
  }));
});
