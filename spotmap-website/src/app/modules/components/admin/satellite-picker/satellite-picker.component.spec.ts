import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { LngLat } from '../../../../models/admin/admin-spot';
import {
  buildImageryStyle,
  IMAGERY_CONFIG,
  IMAGERY_SOURCE_ID,
  type ImageryConfig,
} from '../../../../services/admin/imagery';
import { MAP_FACTORY } from '../../spot-map/map-factory.token';
import {
  PICKER_CITY_ZOOM,
  PICKER_DETAIL_ZOOM,
  PICKER_MAX_ZOOM,
  SatellitePickerComponent,
} from './satellite-picker.component';

/** A keyed stand-in provider; no request ever leaves the test. */
const CONFIG: ImageryConfig = {
  tileUrlTemplate: 'https://tiles.test/imagery/{z}/{y}/{x}',
  tileSize: 512,
  maxZoom: 19,
  attribution: 'Test imagery',
  tokenSetting: 'esri_api_key',
};

const HBF: LngLat = { lng: 16.3785491, lat: 48.1840844 };
const KARLSPLATZ: LngLat = { lng: 16.3699, lat: 48.2003 };

/** Records what the picker asks of a map, without being one. */
class FakeMap {
  readonly handlers = new Map<string, ((event?: unknown) => void)[]>();
  readonly cameraMoves: { method: string; options: unknown }[] = [];
  readonly touchZoomRotate = {
    disableRotation: jasmine.createSpy('touchZoomRotate.disableRotation'),
  };
  readonly keyboard = {
    disableRotation: jasmine.createSpy('keyboard.disableRotation'),
  };
  readonly setStyle = jasmine.createSpy('setStyle');
  readonly zoomIn = jasmine.createSpy('zoomIn');
  readonly zoomOut = jasmine.createSpy('zoomOut');
  /** Where `getCenter()` says the camera is; a spec moves it to stand for a pan. */
  centre: LngLat = { lng: 0, lat: 0 };
  removed = false;

  on(event: string, fn: (event?: unknown) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }
  emit(event: string, payload?: unknown) {
    for (const fn of this.handlers.get(event) ?? []) {
      fn(payload);
    }
  }
  getCenter() {
    return { ...this.centre };
  }
  easeTo(options: unknown) {
    this.cameraMoves.push({ method: 'easeTo', options });
  }
  jumpTo(options: unknown) {
    this.cameraMoves.push({ method: 'jumpTo', options });
  }
  remove() {
    this.removed = true;
  }
}

/** Answers `prefersReducedMotion()`'s media query; call before the camera moves. */
function requestReducedMotion(reduce: boolean) {
  spyOn(window, 'matchMedia').and.callFake(
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

describe('SatellitePickerComponent', () => {
  let fixture: ComponentFixture<SatellitePickerComponent>;
  let fake: FakeMap;
  let mapFactory: jasmine.Spy;
  let getContext: jasmine.Spy;
  let emitted: LngLat[];

  /** Lets the factory's promise and the effects it unblocks run. */
  async function settle() {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function create(
    options: {
      centre?: LngLat;
      zoom?: number;
      token?: string | null;
      config?: ImageryConfig;
    } = {},
  ): Promise<HTMLElement> {
    TestBed.overrideProvider(IMAGERY_CONFIG, {
      useValue: options.config ?? CONFIG,
    });
    fixture = TestBed.createComponent(SatellitePickerComponent);
    fixture.componentRef.setInput('centre', options.centre ?? HBF);
    if (options.zoom !== undefined) {
      fixture.componentRef.setInput('zoom', options.zoom);
    }
    if (options.token !== undefined) {
      fixture.componentRef.setInput('token', options.token);
    }
    emitted = [];
    fixture.componentInstance.position.subscribe((p) => emitted.push(p));
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  beforeEach(() => {
    fake = new FakeMap();
    // Headless Chrome hands out no WebGL context, so the support probe is faked.
    getContext = spyOn(
      HTMLCanvasElement.prototype,
      'getContext',
    ).and.returnValue({
      getExtension: () => ({ loseContext: () => {} }),
    } as unknown as WebGL2RenderingContext);
    mapFactory = jasmine
      .createSpy('mapFactory')
      .and.callFake(() => Promise.resolve(fake));
    TestBed.configureTestingModule({
      imports: [SatellitePickerComponent],
      providers: [{ provide: MAP_FACTORY, useValue: mapFactory }],
    });
  });

  it('builds a flat, north-up imagery map on the opening view', async () => {
    const el = await create({
      centre: HBF,
      zoom: PICKER_CITY_ZOOM,
      token: 'key-1',
    });
    const options = mapFactory.calls.mostRecent().args[0];
    expect(options.container).toBe(el.querySelector('.picker__map'));
    expect(options.style).toEqual(buildImageryStyle(CONFIG, 'key-1'));
    expect(options.center).toEqual([HBF.lng, HBF.lat]);
    expect(options.zoom).toBe(PICKER_CITY_ZOOM);
    expect(options.maxZoom).toBe(PICKER_MAX_ZOOM);
    expect(PICKER_MAX_ZOOM).toBe(21);
    expect(options.dragRotate).toBeFalse();
    expect(options.pitchWithRotate).toBeFalse();
    expect(options.touchPitch).toBeFalse();
    expect(options.attributionControl).toEqual({ compact: true });
    expect(fake.touchZoomRotate.disableRotation).toHaveBeenCalled();
    expect(fake.keyboard.disableRotation).toHaveBeenCalled();
  });

  it('opens at the detail zoom when no zoom is given', async () => {
    await create();
    expect(mapFactory.calls.mostRecent().args[0].zoom).toBe(PICKER_DETAIL_ZOOM);
  });

  it('emits the map centre on load and after every move, and reads it out', async () => {
    const el = await create();
    fake.centre = { lng: 16.1234567, lat: 48.7654321 };
    fake.emit('load');
    fake.centre = { lng: 16.2, lat: 48.3 };
    fake.emit('moveend');
    fixture.detectChanges();
    expect(emitted).toEqual([
      { lng: 16.1234567, lat: 48.7654321 },
      { lng: 16.2, lat: 48.3 },
    ]);
    const readout = byTestId(el, 'picker-readout')!;
    expect(readout.getAttribute('aria-live')).toBe('polite');
    expect(readout.textContent).toContain('48.300000, 16.200000');
  });

  it('labels the map and keeps the pin out of the accessibility tree', async () => {
    const el = await create();
    expect(byTestId(el, 'picker-map')!.getAttribute('aria-label')).toContain(
      'Pan the imagery',
    );
    expect(el.querySelector('.picker__pin')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('eases to a new centre, keeping the zoom input', async () => {
    requestReducedMotion(false);
    await create({ zoom: PICKER_CITY_ZOOM });
    fixture.componentRef.setInput('centre', KARLSPLATZ);
    fixture.detectChanges();
    expect(fake.cameraMoves).toEqual([
      {
        method: 'easeTo',
        options: jasmine.objectContaining({
          center: [KARLSPLATZ.lng, KARLSPLATZ.lat],
          zoom: PICKER_CITY_ZOOM,
        }),
      },
    ]);
  });

  it('jumps to a new centre under reduced motion', async () => {
    requestReducedMotion(true);
    await create();
    fixture.componentRef.setInput('centre', KARLSPLATZ);
    fixture.detectChanges();
    expect(fake.cameraMoves.map((move) => move.method)).toEqual(['jumpTo']);
  });

  it('does not move for a new object holding the same centre', async () => {
    await create();
    fixture.componentRef.setInput('centre', { ...HBF });
    fixture.detectChanges();
    expect(fake.cameraMoves).toEqual([]);
  });

  it('re-applies the style when the token arrives after creation', async () => {
    await create({ token: null });
    expect(fake.setStyle).not.toHaveBeenCalled();
    fixture.componentRef.setInput('token', 'key-2');
    fixture.detectChanges();
    expect(fake.setStyle).toHaveBeenCalledOnceWith(
      buildImageryStyle(CONFIG, 'key-2'),
    );
  });

  it('says so when the provider needs a key and none arrived', async () => {
    const el = await create({ token: null });
    expect(byTestId(el, 'picker-no-token')?.textContent).toContain(
      'pin still works',
    );
    fixture.componentRef.setInput('token', 'key-3');
    fixture.detectChanges();
    expect(byTestId(el, 'picker-no-token')).toBeNull();
  });

  it('shows no key notice for a provider that needs none', async () => {
    const el = await create({
      token: null,
      config: { ...CONFIG, tokenSetting: null },
    });
    expect(byTestId(el, 'picker-no-token')).toBeNull();
  });

  it('shows a tile-error notice for an imagery error until a tile loads', async () => {
    spyOn(console, 'error');
    const el = await create({ token: 'key-1' });
    fake.emit('error', { error: new Error('glyphs') });
    fixture.detectChanges();
    expect(byTestId(el, 'picker-tile-error')).toBeNull();
    fake.emit('error', {
      error: new Error('401'),
      sourceId: IMAGERY_SOURCE_ID,
      tile: {},
    });
    fixture.detectChanges();
    expect(byTestId(el, 'picker-tile-error')).not.toBeNull();
    fake.emit('sourcedata', { sourceId: IMAGERY_SOURCE_ID, tile: {} });
    fixture.detectChanges();
    expect(byTestId(el, 'picker-tile-error')).toBeNull();
  });

  it('zooms through its own 44 px buttons', async () => {
    const el = await create();
    const zoomIn = byTestId(el, 'picker-zoom-in')!;
    const zoomOut = byTestId(el, 'picker-zoom-out')!;
    expect(zoomIn.getAttribute('aria-label')).toBe('Zoom in');
    expect(zoomOut.getAttribute('aria-label')).toBe('Zoom out');
    expect(zoomIn.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(zoomIn.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    zoomIn.click();
    zoomOut.click();
    expect(fake.zoomIn).toHaveBeenCalledTimes(1);
    expect(fake.zoomOut).toHaveBeenCalledTimes(1);
  });

  it('builds no map in a browser without WebGL 2, and says so', async () => {
    getContext.and.returnValue(null);
    const el = await create();
    expect(mapFactory).not.toHaveBeenCalled();
    expect(byTestId(el, 'picker-failure')?.textContent).toContain(
      'cannot draw the map',
    );
    expect(byTestId(el, 'picker-retry')).toBeNull();
  });

  it('offers a retry when the map fails to build, and the retry rebuilds', async () => {
    spyOn(console, 'error');
    mapFactory.and.returnValues(
      Promise.reject(new Error('chunk')),
      Promise.resolve(fake),
    );
    const el = await create();
    byTestId(el, 'picker-retry')!.click();
    await settle();
    expect(mapFactory).toHaveBeenCalledTimes(2);
    expect(byTestId(el, 'picker-failure')).toBeNull();
  });

  it('removes the map when destroyed', async () => {
    await create();
    fixture.destroy();
    expect(fake.removed).toBeTrue();
  });
});
