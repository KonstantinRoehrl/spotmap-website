import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AsciiRainComponent } from './ascii-rain.component';

describe('AsciiRainComponent', () => {
  let fixture: ComponentFixture<AsciiRainComponent>;

  async function create(
    inputs: Partial<{ columns: number; rows: number; pace: string }> = {},
  ) {
    fixture = TestBed.createComponent(AsciiRainComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws one falling strip per column', async () => {
    const host = await create({ columns: 7, rows: 5 });
    expect(host.querySelectorAll('.rain__strip').length).toBe(7);
  });

  it('gives each strip two falls of characters ending in a bright head', async () => {
    const host = await create({ columns: 1, rows: 5 });
    const strip = host.querySelector('.rain__strip')!;
    expect(strip.textContent!.split('\n').length).toBe(10);
    expect(strip.querySelector('.rain__head')?.textContent?.length).toBe(1);
  });

  it('hides itself from assistive technology', async () => {
    const host = await create();
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('pauses on a still frame when frozen', async () => {
    const host = await create({ pace: 'frozen' });
    expect(host.classList).toContain('rain--frozen');
    const strip = host.querySelector('.rain__strip')!;
    expect(getComputedStyle(strip).animationPlayState).toBe('paused');
  });

  it('slows its running animations instead of restarting them', async () => {
    const host = await create({ pace: 'run' });
    fixture.componentRef.setInput('pace', 'slow');
    fixture.detectChanges();
    await fixture.whenStable();
    const rates = host
      .getAnimations({ subtree: true })
      .map((a) => a.playbackRate);
    expect(rates.length).toBeGreaterThan(0);
    expect(rates.every((rate) => rate < 1)).toBeTrue();
  });

  describe('filling the host width', () => {
    async function createFilling(widthPx: number, columns = 3) {
      fixture = TestBed.createComponent(AsciiRainComponent);
      fixture.componentRef.setInput('fillWidth', true);
      // By default far too few to cover any host, so only the measured count can pass.
      fixture.componentRef.setInput('columns', columns);
      const host = fixture.nativeElement as HTMLElement;
      host.style.width = `${widthPx}px`;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return host;
    }

    /** The total width the host's columns take side by side. */
    function coveredWidth(host: HTMLElement): number {
      return Array.from(host.querySelectorAll('.rain__column')).reduce(
        (total, column) => total + column.getBoundingClientRect().width,
        0,
      );
    }

    // Column widths are laid out in 1/64 px steps, so a squeezed row can fall a hair short.
    const LAYOUT_TOLERANCE_PX = 0.5;

    it('covers a wide host', async () => {
      const host = await createFilling(1300);
      expect(coveredWidth(host)).toBeGreaterThanOrEqual(
        1300 - LAYOUT_TOLERANCE_PX,
      );
    });

    it('keeps the dense look on a phone: all `columns` squeezed to fit, not fewer at full width', async () => {
      const host = await createFilling(330, 40);
      const columns = host.querySelectorAll<HTMLElement>('.rain__column');
      expect(columns.length).toBe(40);
      expect(getComputedStyle(columns[0]).flexShrink).not.toBe('0');
      expect(coveredWidth(host)).toBeGreaterThanOrEqual(
        330 - LAYOUT_TOLERANCE_PX,
      );
    });

    it('caps the column count on a huge host, which the columns then stretch to cover', async () => {
      const host = await createFilling(5120, 40);
      const count = host.querySelectorAll('.rain__column').length;
      expect(count).toBeGreaterThan(40);
      expect(count).toBeLessThanOrEqual(160);
      expect(coveredWidth(host)).toBeGreaterThanOrEqual(
        5120 - LAYOUT_TOLERANCE_PX,
      );
    });

    it('still renders, and with fewer columns, for a narrow host', async () => {
      const wide = await createFilling(1300);
      const wideColumns = wide.querySelectorAll('.rain__column').length;
      fixture.destroy();

      const narrow = await createFilling(300);
      const narrowColumns = narrow.querySelectorAll('.rain__column').length;
      expect(narrowColumns).toBeGreaterThan(0);
      expect(narrowColumns).toBeLessThan(wideColumns);
      expect(coveredWidth(narrow)).toBeGreaterThanOrEqual(
        300 - LAYOUT_TOLERANCE_PX,
      );
    });

    it('keeps `columns` when it is not asked to fill', async () => {
      const host = await create({ columns: 3 });
      host.style.width = '1300px';
      fixture.detectChanges();
      await fixture.whenStable();
      expect(host.querySelectorAll('.rain__column').length).toBe(3);
    });
  });
});
