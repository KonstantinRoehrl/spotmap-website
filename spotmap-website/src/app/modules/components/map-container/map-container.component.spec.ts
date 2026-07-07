import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CityEnum } from '../../../models/enums/map-enum';
import { MapContainerComponent } from './map-container.component';

describe('MapContainerComponent', () => {
  let component: MapContainerComponent;
  let fixture: ComponentFixture<MapContainerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapContainerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MapContainerComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('exposes a sanitized url for the selected city', () => {
    expect(component.safeUrl()).toBeTruthy();
  });
});
