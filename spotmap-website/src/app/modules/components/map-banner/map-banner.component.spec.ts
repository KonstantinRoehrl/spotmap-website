import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CityEnum } from '../../../models/enums/map-enum';
import { AsciiAnimationTextComponent } from '../ascii-animation-text/ascii-animation-text.component';
import { MapBannerComponent } from './map-banner.component';
import {
  HEADER_BANNER_FONT_PX,
  RESTING_BANNER_LINE,
  TOPBAR_BANNER_FONT_PX,
} from './topbar-banner';

/** The animation without its endless typewriter timers. */
@Component({ selector: 'app-ascii-animation-text', template: '' })
class StubAnimationComponent {
  readonly messages = input<string[]>([]);
  readonly waitFrames = input(0);
  readonly animationSpeed = input(0);
  readonly loop = input(false);
  readonly fixedFontSize = input<number | null>(null);
  readonly dotGutters = input(true);
}

/** Wide enough for every line at the top bar's size. */
const ROOMY_PX = 360;

describe('MapBannerComponent', () => {
  let fixture: ComponentFixture<MapBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapBannerComponent],
    }).compileComponents();
    TestBed.overrideComponent(MapBannerComponent, {
      remove: { imports: [AsciiAnimationTextComponent] },
      add: { imports: [StubAnimationComponent] },
    });
  });

  afterEach(() => fixture?.destroy());

  /** Builds the banner at `width` px, attached so it lays out, and renders it once. */
  function create(
    variant: 'header' | 'topbar',
    width = ROOMY_PX,
    city = CityEnum.Vienna,
  ): void {
    fixture = TestBed.createComponent(MapBannerComponent);
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('city', city);
    const host = fixture.nativeElement as HTMLElement;
    host.style.cssText = `display:block;width:${width}px;height:24px`;
    fixture.detectChanges();
  }

  /** The animation on screen. */
  function animation(): StubAnimationComponent {
    return fixture.debugElement.query(By.directive(StubAnimationComponent))
      .componentInstance as StubAnimationComponent;
  }

  /** Waits until a ResizeObserver callback has run, then renders. */
  async function measured(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    fixture.detectChanges();
  }

  describe('in the header', () => {
    it('plays the city’s line and the house voice at the set size', () => {
      create('header');
      expect(animation().messages()[0]).toBe('VIENNA SPOTMAP');
      expect(animation().messages()).toContain('CONTINUOUSLY UPDATED');
      expect(animation().messages()).not.toContain(RESTING_BANNER_LINE);
      expect(animation().fixedFontSize()).toBe(HEADER_BANNER_FONT_PX);
      expect(animation().dotGutters()).toBeFalse();
    });

    it('is never measured', async () => {
      const observe = spyOn(ResizeObserver.prototype, 'observe');
      create('header');
      await measured();
      expect(observe).not.toHaveBeenCalled();
    });

    it('keeps its animation across a city change and hands it the new list', () => {
      create('header');
      const before = animation();
      fixture.componentRef.setInput('city', CityEnum.Graz);
      fixture.detectChanges();
      expect(animation()).toBe(before);
      expect(animation().messages()[0]).toBe('GRAZ SPOTMAP');
    });
  });

  describe('in the top bar', () => {
    it('plays the resting line alone until it is measured', () => {
      create('topbar');
      expect(animation().messages()).toEqual([RESTING_BANNER_LINE]);
      expect(animation().fixedFontSize()).toBe(TOPBAR_BANNER_FONT_PX);
    });

    it('then plays the resting line first and every line that fits', async () => {
      create('topbar');
      await measured();
      expect(animation().messages()[0]).toBe(RESTING_BANNER_LINE);
      expect(animation().messages()[1]).toBe('VIENNA SPOTMAP');
      expect(animation().messages()).toContain('CONTINUOUSLY UPDATED');
    });

    it('skips a line wider than its measured width', async () => {
      create('topbar', 200);
      await measured();
      expect(animation().messages()).toContain(RESTING_BANNER_LINE);
      expect(animation().messages()).not.toContain(
        'SUPPORTED BY ROLLTROTTEL-VERBAND',
      );
    });

    it('falls back to the resting line when nothing fits', async () => {
      create('topbar', 20);
      await measured();
      expect(animation().messages()).toEqual([RESTING_BANNER_LINE]);
    });

    it('recreates its animation for a new set of lines, and keeps it for the same set', async () => {
      create('topbar');
      await measured();
      const before = animation();
      fixture.detectChanges();
      expect(animation()).toBe(before);

      fixture.componentRef.setInput('city', CityEnum.Graz);
      fixture.detectChanges();
      expect(animation()).not.toBe(before);
      expect(animation().messages()).toContain('GRAZ SPOTMAP');
    });

    it('stops measuring when destroyed', async () => {
      const disconnect = spyOn(
        ResizeObserver.prototype,
        'disconnect',
      ).and.callThrough();
      create('topbar');
      await measured();
      disconnect.calls.reset();
      fixture.destroy();
      expect(disconnect).toHaveBeenCalled();
    });
  });
});
