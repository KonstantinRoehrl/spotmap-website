import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum } from '../../../models/enums/map-enum';
import {
  ELEVATION_LOADER,
  MAP_FACTORY,
  POPUP_FACTORY,
} from '../../components/spot-map/map-factory.token';
import { SpotMapComponent } from '../../components/spot-map/spot-map.component';
import { MapComponent } from './map.component';

/**
 * Vienna — the city this page defaults to — renders through SpotMapComponent, which injects
 * both maplibre factories and the elevation loader as soon as it is constructed. These tests
 * never let it call any of them, so never-resolving stubs are enough; providing them is also
 * what keeps the ESM-only maplibre-gl and maplibre-contour out of the karma bundle, the reason
 * none of the three tokens carries a default (map-factory.token.ts). The HTTP testing backend
 * below belongs to the same seal: a browser that does report WebGL would let the renderer start
 * loading a city's spots, and these tests are about the page's city selection, not about that
 * request.
 */
const neverResolves = () => new Promise<never>(() => {});

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;

  /**
   * What the browser actually paints for a design token, so a glow assertion compares rendered
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAP_FACTORY, useValue: neverResolves },
        { provide: POPUP_FACTORY, useValue: neverResolves },
        { provide: ELEVATION_LOADER, useValue: neverResolves },
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

  it('gives the city field the shared pointer bloom and a Standard-tier value', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-form-field')!.classList).toContain(
      'phosphor-bloom',
    );
    expect(
      getComputedStyle(host.querySelector('.mat-mdc-select-value')!).textShadow,
    ).toBe(painted('text-shadow', 'var(--glow-text-standard)'));
  });

  it('gives every city option the shared pointer bloom', () => {
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('.mat-mdc-select-trigger') as HTMLElement).click();
    // No whenStable(): the ASCII banner keeps a timer running for the page's lifetime, so the
    // zone never settles. The panel and its options render on this change detection alone.
    fixture.detectChanges();
    const options = Array.from(document.querySelectorAll('mat-option'));
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.classList).toContain('phosphor-bloom');
    }
  });

  /** Moves a pointer over `element`; a real pointer always enters before it moves, which is when the bloom measures its host. */
  function movePointerOver(element: Element): void {
    for (const type of ['pointerenter', 'pointermove']) {
      element.dispatchEvent(
        new PointerEvent(type, { clientX: 1, clientY: 1, bubbles: false }),
      );
    }
  }

  it('makes the city field bloom follow the pointer', () => {
    const field = (fixture.nativeElement as HTMLElement).querySelector(
      'mat-form-field',
    )!;
    movePointerOver(field);
    expect((field as HTMLElement).style.getPropertyValue('--x')).not.toBe('');
  });

  it('makes every city option bloom follow the pointer', () => {
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('.mat-mdc-select-trigger') as HTMLElement).click();
    fixture.detectChanges();
    const option = document.querySelector('mat-option') as HTMLElement;
    movePointerOver(option);
    expect(option.style.getPropertyValue('--x')).not.toBe('');
  });

  /** Opens the city select and returns the first option, with its transitions off so the lit look reads at once. */
  function openFirstOption(): HTMLElement {
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('.mat-mdc-select-trigger') as HTMLElement).click();
    fixture.detectChanges();
    const option = document.querySelector('mat-option') as HTMLElement;
    option.style.transition = 'none';
    return option;
  }

  it('keeps the highlighted option inside the panel: inset layers only, no outer halo', () => {
    const option = openFirstOption();
    option.classList.add('mat-mdc-option-active');
    const style = getComputedStyle(option);
    expect(style.getPropertyValue('--bloom-halo').trim()).toBe('0px');
    // The panel clips at its edge, so the outer layer of the lit shadow must have no blur.
    const [outer] = style.boxShadow.split(/,\s*(?![^(]*\))/);
    expect(outer).toMatch(/ 0px 0px 0px 0px$/);
    expect(style.boxShadow).toContain('inset');
  });

  it('leaves a disabled option unlit even when it is the keyboard-active one', () => {
    const option = openFirstOption();
    option.classList.add('mat-mdc-option-active', 'mdc-list-item--disabled');
    const style = getComputedStyle(option);
    expect(style.boxShadow).toBe('none');
    expect(style.color).toBe(painted('color', 'var(--color-phosphor)'));
  });

  describe('the city field label and value', () => {
    let host: HTMLElement;
    let label: HTMLElement;
    let value: HTMLElement;

    beforeEach(() => {
      host = fixture.nativeElement as HTMLElement;
      label = host.querySelector('.mat-mdc-floating-label') as HTMLElement;
      value = host.querySelector('.mat-mdc-select-value') as HTMLElement;
      label.style.transition = 'none';
      value.style.transition = 'none';
    });

    it('rests in the Standard tier', () => {
      for (const element of [label, value]) {
        expect(getComputedStyle(element).textShadow).toBe(
          painted('text-shadow', 'var(--glow-text-standard)'),
        );
      }
    });

    it('takes the Display tier and the bright mint when the field is focused', () => {
      (host.querySelector('mat-select') as HTMLElement).focus();
      for (const element of [label, value]) {
        const style = getComputedStyle(element);
        expect(style.textShadow).toBe(
          painted('text-shadow', 'var(--glow-text-display)'),
        );
        expect(style.color).toBe(
          painted('color', 'var(--color-phosphor-bright)'),
        );
      }
    });

    it('fades the swap instead of cutting it', () => {
      for (const element of [label, value]) {
        element.style.transition = '';
        const properties = getComputedStyle(element).transitionProperty;
        expect(properties).toContain('text-shadow');
        expect(properties).toContain('color');
      }
    });
  });
});
