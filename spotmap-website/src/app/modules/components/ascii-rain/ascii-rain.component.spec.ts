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
});
