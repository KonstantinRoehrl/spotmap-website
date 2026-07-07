import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum } from '../../../models/enums/map-enum';
import { MapComponent } from './map.component';

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [provideNoopAnimations()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('falls back to Vienna when localStorage.getItem throws', () => {
    spyOn(localStorage, 'getItem').and.throwError('SecurityError');
    const f = TestBed.createComponent(MapComponent);
    expect(() => f.detectChanges()).not.toThrow();
    expect(f.componentInstance['selectedCity']().city).toBe(CityEnum.Vienna);
  });

  it('does not throw when localStorage.setItem throws', () => {
    spyOn(localStorage, 'setItem').and.throwError('QuotaExceeded');
    const f = TestBed.createComponent(MapComponent);
    f.detectChanges();
    const anyCity = SUPPORTED_CITIES[CityEnum.Graz];
    expect(() => f.componentInstance.selectCity(anyCity)).not.toThrow();
  });
});
