import { SecurityContext } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';

import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum, MapFailureReason } from '../../../models/enums/map-enum';
import { GmapsEmbedComponent } from './gmaps-embed.component';

describe('GmapsEmbedComponent', () => {
  let fixture: ComponentFixture<GmapsEmbedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GmapsEmbedComponent],
    }).compileComponents();
  });

  /** Create + bind the required inputs. Pass `render` to also run change detection. */
  function create(retryToken: number, render = false): GmapsEmbedComponent {
    fixture = TestBed.createComponent(GmapsEmbedComponent);
    fixture.componentRef.setInput('city', CityEnum.Vienna);
    fixture.componentRef.setInput('retryToken', retryToken);
    if (render) {
      fixture.detectChanges();
    }
    return fixture.componentInstance;
  }

  /** Unwrap the bypassed resource url without handing it to a live iframe. */
  function resolvedUrl(c: GmapsEmbedComponent): string | null {
    return TestBed.inject(DomSanitizer).sanitize(
      SecurityContext.RESOURCE_URL,
      c.safeUrl(),
    );
  }

  it('points the first load at the unmodified map link', () => {
    const c = create(0);
    expect(resolvedUrl(c)).toBe(SUPPORTED_CITIES[CityEnum.Vienna].mapLink);
    fixture.destroy();
  });

  it('cache-busts the url once the retry token is bumped', () => {
    const c = create(1);
    expect(resolvedUrl(c)).toBe(
      `${SUPPORTED_CITIES[CityEnum.Vienna].mapLink}&_r=1`,
    );
    fixture.destroy();
  });

  it('emits ready when the iframe reports load', () => {
    const c = create(0, true);
    let readyCount = 0;
    c.ready.subscribe(() => readyCount++);

    const iframe: HTMLIFrameElement =
      fixture.nativeElement.querySelector('iframe');
    iframe.dispatchEvent(new Event('load'));

    expect(readyCount).toBeGreaterThan(0);
    fixture.destroy();
  });

  it('emits failed with unreachable when the iframe errors', () => {
    const c = create(0, true);
    const reasons: MapFailureReason[] = [];
    c.failed.subscribe((reason) => reasons.push(reason));

    const iframe: HTMLIFrameElement =
      fixture.nativeElement.querySelector('iframe');
    iframe.dispatchEvent(new Event('error'));

    expect(reasons).toEqual(['unreachable']);
    fixture.destroy();
  });
});
