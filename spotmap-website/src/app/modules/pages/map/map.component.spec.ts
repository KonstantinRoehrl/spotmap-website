import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum } from '../../../models/enums/map-enum';
import {
  MAP_FACTORY,
  POPUP_FACTORY,
} from '../../components/spot-map/map-factory.token';
import { SpotMapComponent } from '../../components/spot-map/spot-map.component';
import { MapComponent } from './map.component';

/**
 * Vienna — the city this page defaults to — renders through SpotMapComponent, which injects
 * both maplibre factories as soon as it is constructed. These tests never let it call either
 * one, so never-resolving stubs are enough; providing them is also what keeps the ESM-only
 * maplibre-gl out of the karma bundle, the reason neither token carries a default
 * (map-factory.token.ts). The HTTP testing backend below belongs to the same seal: a browser
 * that does report WebGL would let the renderer start loading a city's spots, and these tests
 * are about the page's city selection, not about that request.
 */
const neverResolves = () => new Promise<never>(() => {});

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAP_FACTORY, useValue: neverResolves },
        { provide: POPUP_FACTORY, useValue: neverResolves },
      ],
    }).compileComponents();

    // The page owns the city selection, not the renderer: blank the map's template so these
    // tests never build a WebGL context. Its own markup is covered by spot-map.component.spec.ts.
    TestBed.overrideComponent(SpotMapComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('falls back to Vienna when localStorage.getItem throws', () => {
    spyOn(localStorage, 'getItem').and.throwError('SecurityError');
    const f = TestBed.createComponent(MapComponent);
    expect(() => f.detectChanges()).not.toThrow();
    expect(f.componentInstance['selectedCity']().city).toBe(CityEnum.Vienna);
    f.destroy();
  });

  it('does not throw when localStorage.setItem throws', () => {
    spyOn(localStorage, 'setItem').and.throwError('QuotaExceeded');
    const f = TestBed.createComponent(MapComponent);
    f.detectChanges();
    const anyCity = SUPPORTED_CITIES[CityEnum.Graz];
    expect(() => f.componentInstance.selectCity(anyCity)).not.toThrow();
    f.destroy();
  });
});
