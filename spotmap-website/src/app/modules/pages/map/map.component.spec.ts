import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import { CityEnum } from '../../../models/enums/map-enum';
import { CityPickerComponent } from '../../components/city-picker/city-picker.component';
import { USER_CITY_STORAGE_KEY } from '../../components/city-picker/stored-city';
import { MapContainerComponent } from '../../components/map-container/map-container.component';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
} from '../../components/spot-map/map-factory.token';
import { SpotMapComponent } from '../../components/spot-map/spot-map.component';
import { MapComponent } from './map.component';

/**
 * Vienna — the city this page defaults to — renders through SpotMapComponent, which injects
 * the maplibre map factory and the elevation loader as soon as it is constructed. These tests
 * never let it call any of them, so never-resolving stubs are enough; providing them is also
 * what keeps the ESM-only maplibre-gl and maplibre-contour out of the karma bundle, the reason
 * neither token carries a default (map-factory.token.ts). The HTTP testing backend
 * below belongs to the same seal: a browser that does report WebGL would let the renderer start
 * loading a city's spots, and these tests are about the page's city selection, not about that
 * request.
 */
const neverResolves = () => new Promise<never>(() => {});

describe('MapComponent', () => {
  let fixture: ComponentFixture<MapComponent>;

  beforeEach(async () => {
    localStorage.removeItem(USER_CITY_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAP_FACTORY, useValue: neverResolves },
        { provide: ELEVATION_LOADER, useValue: neverResolves },
      ],
    }).compileComponents();

    // The page owns the city selection, not the renderer: blank the map's template so these
    // tests never build a WebGL context. Its own markup is covered by spot-map.component.spec.ts.
    TestBed.overrideComponent(SpotMapComponent, { set: { template: '' } });
  });

  afterEach(() => {
    fixture?.destroy();
    localStorage.removeItem(USER_CITY_STORAGE_KEY);
  });

  /** Creates the page and renders it once. */
  function create(): void {
    fixture = TestBed.createComponent(MapComponent);
    fixture.detectChanges();
  }

  /** The page's city picker and map container. */
  const picker = () =>
    fixture.debugElement.query(By.directive(CityPickerComponent))
      .componentInstance as CityPickerComponent;
  const container = () =>
    fixture.debugElement.query(By.directive(MapContainerComponent))
      .componentInstance as MapContainerComponent;

  it('should create', () => {
    create();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('opens on the city remembered from the last visit', () => {
    localStorage.setItem(USER_CITY_STORAGE_KEY, CityEnum.Linz);
    create();
    expect(picker().selected()).toBe(SUPPORTED_CITIES[CityEnum.Linz]);
    expect(container().city()).toBe(CityEnum.Linz);
  });

  it('stores a city chosen in the picker and shows its map', () => {
    create();
    picker().citySelected.emit(SUPPORTED_CITIES[CityEnum.Graz]);
    fixture.detectChanges();
    expect(localStorage.getItem(USER_CITY_STORAGE_KEY)).toBe(CityEnum.Graz);
    expect(picker().selected()).toBe(SUPPORTED_CITIES[CityEnum.Graz]);
    expect(container().city()).toBe(CityEnum.Graz);
  });
});
