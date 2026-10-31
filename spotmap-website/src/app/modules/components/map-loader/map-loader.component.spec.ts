import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  AsciiRainComponent,
  RAIN_CHARACTERS,
} from '../ascii-rain/ascii-rain.component';
import { MapLoadState } from './map-load-progress';
import { MapLoaderComponent } from './map-loader.component';

describe('MapLoaderComponent', () => {
  let fixture: ComponentFixture<MapLoaderComponent>;

  function create(state: Partial<MapLoadState> = {}): HTMLElement {
    fixture = TestBed.createComponent(MapLoaderComponent);
    fixture.componentRef.setInput('city', 'vienna');
    setState(state);
    return fixture.nativeElement as HTMLElement;
  }

  function setState(state: Partial<MapLoadState>): void {
    fixture.componentRef.setInput('state', {
      step: 'spots',
      progress: 0,
      fallback: false,
      ...state,
    });
    fixture.detectChanges();
  }

  function cells(host: HTMLElement): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('.loader__cell'));
  }

  function fill(host: HTMLElement): HTMLElement | null {
    return host.querySelector<HTMLElement>('.loader__fill');
  }

  /** Resolves a token the way the browser paints it, so a spec compares like with like. */
  function painted(property: 'color' | 'text-shadow', token: string): string {
    const probe = document.createElement('span');
    probe.style.setProperty(property, token);
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return value;
  }

  it('spells the city in uppercase cells', () => {
    const host = create();
    expect(cells(host).length).toBe(6);
    const letters = Array.from(
      host.querySelectorAll('.loader__letter'),
      (letter) => letter.textContent!.trim(),
    ).join('');
    expect(letters).toBe('VIENNA');
  });

  it('locks letters left to right as progress grows', () => {
    const host = create({ progress: 0.45 });
    const locked = () =>
      cells(host).map((cell) =>
        cell.classList.contains('loader__cell--locked'),
      );
    expect(locked()).toEqual([true, true, true, false, false, false]);

    setState({ progress: 0.9 });
    expect(locked()).toEqual([true, true, true, true, true, true]);
  });

  it('marks the steps pending, current and finished', () => {
    const host = create({ step: 'map', progress: 0.5 });
    const steps = host.querySelectorAll('.loader__steps span');
    expect(steps.length).toBe(3);
    expect(steps[0]?.textContent?.trim()).toBe('SPOTS');
    expect(steps[0]?.className).toContain('loader__step--done');
    expect(steps[1]?.textContent?.trim()).toBe('MAP');
    expect(steps[1]?.className).toContain('loader__step--current');
    expect(steps[2]?.textContent?.trim()).toBe('DRAW');
    expect(steps[2]?.className).toContain('loader__step--pending');
  });

  it('shows the archive note only on fallback', () => {
    const host = create();
    const note = () => host.querySelector('.loader__note')?.textContent?.trim();
    expect(note()).toBe('');

    setState({ fallback: true });
    expect(note()).toBe('LIVE FEED DOWN · ARCHIVE COPY');
  });

  it('eases the rain down once the spots are in and freezes it at DRAW', () => {
    create({ step: 'spots' });
    const rain = () =>
      fixture.debugElement.query(By.directive(AsciiRainComponent))
        ?.componentInstance as AsciiRainComponent | undefined;
    expect(rain()?.pace()).toBe('run');

    setState({ step: 'map' });
    expect(rain()?.pace()).toBe('slow');

    setState({ step: 'draw' });
    expect(rain()?.pace()).toBe('frozen');
  });

  it('sizes the bar fill to the progress', () => {
    const host = create({ progress: 0.3 });
    expect(fill(host)?.style.width).toBe('30%');
  });

  it('rounds the bar fill less than half its height, so its ends are not pills', () => {
    const host = create({ progress: 0.3 });
    const barFill = fill(host)!;
    const radius = parseFloat(getComputedStyle(barFill).borderTopLeftRadius);
    // Positive, so a missing --radius-sm cannot pass this by resolving to no rounding at all.
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThan(barFill.getBoundingClientRect().height / 2);
  });

  it("signals finished once the bar's ease to 100 % ends", () => {
    const host = create({ step: 'map', progress: 0.9 });
    expect(fill(host)).not.toBeNull();
    let emitted = 0;
    fixture.componentInstance.finished.subscribe(() => emitted++);
    const end = (propertyName: string) =>
      fill(host)?.dispatchEvent(
        new TransitionEvent('transitionend', { propertyName }),
      );

    end('width');
    expect(emitted).toBe(0);

    setState({ step: 'done', progress: 1 });
    end('opacity');
    expect(emitted).toBe(0);

    end('width');
    end('width');
    expect(emitted).toBe(1);
  });

  it('lights the locked letters in the Display tier', () => {
    const host = create({ progress: 1, step: 'draw' });
    const letter = host.querySelector('.loader__letter')!;
    expect(getComputedStyle(letter).textShadow).toBe(
      painted('text-shadow', 'var(--glow-text-display)'),
    );
  });

  it('lights only the current step; pending, done and the note stay unlit', () => {
    const host = create({ step: 'map', progress: 0.5, fallback: true });
    const current = host.querySelector('.loader__step--current')!;
    expect(getComputedStyle(current).textShadow).toBe(
      painted('text-shadow', 'var(--glow-text-standard)'),
    );
    for (const selector of [
      '.loader__step--pending',
      '.loader__step--done',
      '.loader__fallback',
    ]) {
      expect(getComputedStyle(host.querySelector(selector)!).textShadow)
        .withContext(selector)
        .toBe('none');
    }
  });

  it('hides all of it from assistive technology', () => {
    const host = create();
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  describe('rain backdrop', () => {
    /** Creates the loader in a host of the given width and lets the rain measure it. */
    async function createAtWidth(widthPx: number): Promise<HTMLElement> {
      fixture = TestBed.createComponent(MapLoaderComponent);
      fixture.componentRef.setInput('city', 'vienna');
      const host = fixture.nativeElement as HTMLElement;
      host.style.width = `${widthPx}px`;
      setState({});
      await fixture.whenStable();
      fixture.detectChanges();
      return host;
    }

    // Column widths are laid out in 1/64 px steps, so a squeezed row can fall a hair short.
    const LAYOUT_TOLERANCE_PX = 0.5;

    function rainWidth(host: HTMLElement): number {
      const columns = host.querySelectorAll('.rain__column');
      return columns.length * columns[0].getBoundingClientRect().width;
    }

    it('covers a wide map frame', async () => {
      const host = await createAtWidth(1300);
      expect(rainWidth(host)).toBeGreaterThanOrEqual(
        1300 - LAYOUT_TOLERANCE_PX,
      );
    });

    it('still covers a phone-width map frame', async () => {
      const host = await createAtWidth(360);
      expect(rainWidth(host)).toBeGreaterThanOrEqual(360 - LAYOUT_TOLERANCE_PX);
    });
  });

  it("scrambles through the rain's characters", () => {
    const host = create();
    const glyphs = Array.from(host.querySelectorAll('.loader__scramble'))
      .map((strip) => strip.textContent!.replace(/\s/g, ''))
      .join('');
    expect(glyphs.length).toBeGreaterThan(0);
    expect([...glyphs].every((glyph) => RAIN_CHARACTERS.includes(glyph))).toBe(
      true,
    );
  });
});
