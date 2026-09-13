import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpotFeature, SpotProperties } from '../../../models/spots/spot';
import { SpotPopupComponent } from './spot-popup.component';

function spot(overrides: Partial<SpotProperties> = {}): SpotFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [16.4169023, 48.2397385] },
    properties: {
      id: 'donaupark',
      name: 'Donaupark',
      status: 'active',
      photos: [
        'spots/vienna/donaupark-1.webp',
        'spots/vienna/donaupark-2.webp',
      ],
      ...overrides,
    },
  };
}

describe('SpotPopupComponent', () => {
  let fixture: ComponentFixture<SpotPopupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpotPopupComponent],
    }).compileComponents();
  });

  function create(feature: SpotFeature): HTMLElement {
    fixture = TestBed.createComponent(SpotPopupComponent);
    fixture.componentRef.setInput('spot', feature);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('names the spot', () => {
    expect(create(spot()).textContent).toContain('Donaupark');
  });

  it('hands the spot photos to the gallery', () => {
    const img = create(spot()).querySelector('app-spot-photo-gallery img');
    expect(img?.getAttribute('src')).toBe('spots/vienna/donaupark-1.webp');
  });

  it('marks a demolished spot as demolished', () => {
    expect(create(spot({ status: 'demolished' })).textContent).toContain(
      'DEMOLISHED',
    );
  });

  it('leaves a standing spot unmarked', () => {
    expect(create(spot()).textContent).not.toContain('DEMOLISHED');
  });

  it('links to the coordinates with a geo URI any maps app can take', () => {
    const link = create(spot({ name: 'Hbf Curb' })).querySelector('a');
    expect(link?.getAttribute('href')).toBe(
      'geo:48.2397385,16.4169023?q=48.2397385,16.4169023(Hbf%20Curb)',
    );
  });

  it('omits the gallery for a spot with no photos', () => {
    const el = create(spot({ photos: [] }));
    expect(el.querySelector('app-spot-photo-gallery')).toBeNull();
    expect(el.textContent).toContain('Donaupark');
  });
});
