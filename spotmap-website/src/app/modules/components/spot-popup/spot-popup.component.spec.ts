import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpotFeature, SpotProperties } from '../../../models/spots/spot';
import { SpotPopupComponent } from './spot-popup.component';
import {
  SPOTMAP_BACKEND,
  SpotmapBackend,
  UNCONFIGURED_BACKEND,
} from '../../../services/spotmap-backend';

const PHOTO_BASE = 'https://api.test/storage/v1/object/public/spot-photos';

const BACKEND: SpotmapBackend = {
  apiUrl: 'https://api.test',
  publishableKey: 'sb_publishable_test', // gitleaks:allow
  photoBaseUrl: PHOTO_BASE,
};

function spot(overrides: Partial<SpotProperties> = {}): SpotFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [16.4169023, 48.2397385] },
    properties: {
      id: 'donaupark',
      name: 'Donaupark',
      status: 'active',
      notes: null,
      photos: ['vienna/donaupark-1.webp', 'vienna/donaupark-2.webp'],
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

  function create(
    feature: SpotFeature,
    backend: SpotmapBackend = BACKEND,
  ): HTMLElement {
    TestBed.overrideProvider(SPOTMAP_BACKEND, { useValue: backend });
    fixture = TestBed.createComponent(SpotPopupComponent);
    fixture.componentRef.setInput('spot', feature);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** The popup's direct children by class, in DOM order. */
  function order(el: HTMLElement): string[] {
    return [...el.querySelector('.spot-popup')!.children].map(
      (child) => child.classList[0] ?? child.tagName.toLowerCase(),
    );
  }

  it('names the spot', () => {
    expect(create(spot()).textContent).toContain('Donaupark');
  });

  it('hands the gallery thumbnail URLs built from the photo keys', () => {
    const img = create(spot()).querySelector('app-spot-photo-gallery img');
    expect(img?.getAttribute('src')).toBe(
      `${PHOTO_BASE}/thumb/vienna/donaupark-1.webp`,
    );
  });

  it('marks the photos as all rights reserved, right under the gallery', () => {
    const el = create(spot());
    expect(el.querySelector('.spot-popup__rights')?.textContent?.trim()).toBe(
      '© all rights reserved',
    );
    expect(order(el).slice(0, 3)).toEqual([
      'app-spot-photo-gallery',
      'spot-popup__rights',
      'spot-popup__name',
    ]);
  });

  it('shows no gallery and no photo mark without a photo host', () => {
    const el = create(spot(), UNCONFIGURED_BACKEND);
    expect(el.querySelector('app-spot-photo-gallery')).toBeNull();
    expect(el.querySelector('.spot-popup__rights')).toBeNull();
  });

  it('shows the notes verbatim under the name, line breaks kept', () => {
    const el = create(
      spot({
        notes: 'Gap into Bank??\nVon Polizei gekickt',
        status: 'demolished',
      }),
    );
    const notes = el.querySelector('.spot-popup__notes') as HTMLElement;
    expect(notes.textContent).toBe('Gap into Bank??\nVon Polizei gekickt');
    expect(getComputedStyle(notes).whiteSpace).toBe('pre-line');
    expect(getComputedStyle(notes).textTransform).toBe('none');
    expect(order(el)).toEqual([
      'app-spot-photo-gallery',
      'spot-popup__rights',
      'spot-popup__name',
      'spot-popup__notes',
      'spot-popup__status',
      'spot-popup__directions',
    ]);
  });

  it('keeps the notes unlit, so prose reads in sunlight', () => {
    const notes = create(spot({ notes: 'Big' })).querySelector(
      '.spot-popup__notes',
    )!;
    expect(getComputedStyle(notes).textShadow).toBe('none');
  });

  it('leaves the notes out when the spot has none', () => {
    expect(create(spot()).querySelector('.spot-popup__notes')).toBeNull();
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

  it('leaves the demolished line unlit, with none of the glow the name carries', () => {
    // text-shadow inherits, and styles.css puts the resting glow on every div — so a rule that
    // only sets a colour still paints this line with the bloom it is supposed to have dropped.
    const status = create(spot({ status: 'demolished' })).querySelector(
      '.spot-popup__status',
    )!;
    expect(getComputedStyle(status).textShadow).toBe('none');
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

  it('leaves the archive open when the maps hand-off is followed', () => {
    const link = create(spot()).querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('gives the maps tab no handle on the archive it came from', () => {
    const rel = create(spot()).querySelector('a')?.getAttribute('rel') ?? '';
    expect(rel.split(/\s+/)).toEqual(
      jasmine.arrayContaining(['noopener', 'noreferrer']),
    );
  });

  it('omits the gallery and the photo mark for a spot with no photos', () => {
    const el = create(spot({ photos: [] }));
    expect(el.querySelector('app-spot-photo-gallery')).toBeNull();
    expect(el.querySelector('.spot-popup__rights')).toBeNull();
    expect(el.textContent).toContain('Donaupark');
  });
});
