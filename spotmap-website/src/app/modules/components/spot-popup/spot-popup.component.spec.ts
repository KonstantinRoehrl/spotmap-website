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

/**
 * What the browser actually paints for a design token, so a colour assertion compares rendered
 * output instead of the stylesheet's text.
 */
function painted(property: 'color' | 'text-shadow', token: string): string {
  const probe = document.createElement('span');
  probe.style.setProperty(property, token);
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return value;
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

  it('leaves amber to the selection ring instead of the demolished line', () => {
    const status = create(spot({ status: 'demolished' })).querySelector(
      '.spot-popup__status',
    )!;
    const style = getComputedStyle(status);
    expect(style.color).not.toBe(painted('color', 'var(--color-amber)'));
    expect(style.textShadow).not.toBe(
      painted('text-shadow', 'var(--glow-text-amber)'),
    );
  });

  it('recedes the demolished line the way a ghosted pin recedes', () => {
    const status = create(spot({ status: 'demolished' })).querySelector(
      '.spot-popup__status',
    )!;
    expect(getComputedStyle(status).color).toBe(
      painted('color', 'var(--color-phosphor-dim)'),
    );
  });

  it('leaves a standing spot unmarked', () => {
    expect(create(spot()).textContent).not.toContain('DEMOLISHED');
  });

  it('links to the coordinates through a maps URL, not a scheme iOS cannot open', () => {
    const href = create(spot()).querySelector('a')?.getAttribute('href') ?? '';
    expect(href.startsWith('https://')).toBeTrue();
  });

  it('points the maps URL at the spot coordinates', () => {
    const link = create(spot({ name: 'Hbf Curb' })).querySelector('a');
    expect(link?.getAttribute('href')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=48.2397385%2C16.4169023',
    );
  });

  it('omits the gallery for a spot with no photos', () => {
    const el = create(spot({ photos: [] }));
    expect(el.querySelector('app-spot-photo-gallery')).toBeNull();
    expect(el.textContent).toContain('Donaupark');
  });
});
