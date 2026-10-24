import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapItem } from '../../../models/enums/interfaces/map-item-interface';
import { CityEnum } from '../../../models/enums/map-enum';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import { CityPickerComponent } from './city-picker.component';

describe('CityPickerComponent', () => {
  let fixture: ComponentFixture<CityPickerComponent>;
  let chosen: MapItem[];

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
      imports: [CityPickerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CityPickerComponent);
    fixture.componentRef.setInput(
      'selected',
      SUPPORTED_CITIES[CityEnum.Vienna],
    );
    chosen = [];
    fixture.componentInstance.citySelected.subscribe((city) =>
      chosen.push(city),
    );
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  /** Opens the panel; the options render on this change detection. */
  function openPanel(): void {
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('.mat-mdc-select-trigger') as HTMLElement).click();
    fixture.detectChanges();
  }

  it('shows the selected city with its country code', async () => {
    // MatSelect adopts its initial value a microtask after the first render, and only then
    // projects the custom trigger.
    await fixture.whenStable();
    fixture.detectChanges();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'mat-select-trigger',
    )!;
    expect(trigger.textContent!.trim()).toBe('vienna · AT');
  });

  it('follows a new selected city', () => {
    fixture.componentRef.setInput('selected', SUPPORTED_CITIES[CityEnum.Split]);
    fixture.detectChanges();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'mat-select-trigger',
    )!;
    expect(trigger.textContent!.trim()).toBe('split · HR');
  });

  it('groups the cities by country in country-name order, under uppercase labels', () => {
    openPanel();
    const labels = Array.from(
      document.querySelectorAll('mat-optgroup .mat-mdc-optgroup-label'),
    ).map((label) => label.textContent!.trim());
    const countries = [
      ...new Set(Object.values(SUPPORTED_CITIES).map((city) => city.country)),
    ]
      .sort((a, b) => a.localeCompare(b))
      .map((country) => country.toUpperCase());
    expect(labels).toEqual(countries);
  });

  it('reports the city the visitor picks, as its own picker entry', () => {
    openPanel();
    const graz = Array.from(document.querySelectorAll('mat-option')).find(
      (option) => option.textContent!.trim() === 'graz',
    ) as HTMLElement;
    graz.click();
    fixture.detectChanges();
    expect(chosen).toEqual([SUPPORTED_CITIES[CityEnum.Graz]]);
    expect(chosen[0]).toBe(SUPPORTED_CITIES[CityEnum.Graz]);
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
    openPanel();
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
    openPanel();
    const option = document.querySelector('mat-option') as HTMLElement;
    movePointerOver(option);
    expect(option.style.getPropertyValue('--x')).not.toBe('');
  });

  /** Opens the city select and returns the first option, with its transitions off so the lit look reads at once. */
  function openFirstOption(): HTMLElement {
    openPanel();
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
