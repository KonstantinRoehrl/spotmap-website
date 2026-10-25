import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpotPhotoGalleryComponent } from './spot-photo-gallery.component';

describe('SpotPhotoGalleryComponent', () => {
  let fixture: ComponentFixture<SpotPhotoGalleryComponent>;

  function create(photos: string[]) {
    fixture = TestBed.createComponent(SpotPhotoGalleryComponent);
    fixture.componentRef.setInput('photos', photos);
    fixture.componentRef.setInput('spotName', 'Hbf Curb');
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpotPhotoGalleryComponent],
    }).compileComponents();
  });

  it('shows the first photo, with no counter of its own', () => {
    create(['a.webp', 'b.webp', 'c.webp']);
    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('src')).toBe('a.webp');
    expect(fixture.nativeElement.querySelector('.gallery__counter')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('[1/3]');
  });

  it('advances and wraps around', () => {
    const c = create(['a.webp', 'b.webp']);
    c.next();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'b.webp',
    );
    c.next();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'a.webp',
    );
  });

  it('steps backwards from the first photo to the last', () => {
    const c = create(['a.webp', 'b.webp', 'c.webp']);
    c.previous();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'c.webp',
    );
  });

  it('hides the arrows for a single photo', () => {
    create(['only.webp']);
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
    expect(
      fixture.nativeElement.querySelector('.gallery__controls'),
    ).toBeNull();
  });

  it('labels the image with the spot name for screen readers', () => {
    create(['a.webp', 'b.webp']);
    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('alt')).toBe('Hbf Curb, photo 1 of 2');
  });

  /** Loads the image currently on screen, the way a reachable URL would. */
  function loadCurrentImage() {
    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('load'));
    fixture.detectChanges();
  }

  /** Fails the image currently on screen, the way a dead URL would. */
  function failCurrentImage() {
    fixture.nativeElement
      .querySelector('img')
      .dispatchEvent(new Event('error'));
    fixture.detectChanges();
  }

  it('shows an in-style placeholder instead of a broken image', () => {
    create(['a.webp', 'b.webp']);
    failCurrentImage();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('img')).toBeNull();
    const placeholder = el.querySelector('.gallery__placeholder');
    expect(placeholder?.getAttribute('role')).toBe('img');
    expect(placeholder?.getAttribute('aria-label')).toBe(
      'Hbf Curb, photo 1 of 2, did not load',
    );
    expect(placeholder?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '> SIGNAL LOST PHOTO UNREACHABLE',
    );
  });

  it('keeps the arrows working past a broken photo', () => {
    const c = create(['a.webp', 'b.webp']);
    failCurrentImage();
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(2);
    c.next();
    fixture.detectChanges();
    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('src')).toBe('b.webp');
    expect(img.getAttribute('alt')).toBe('Hbf Curb, photo 2 of 2');
    c.previous();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.gallery__placeholder'),
    ).not.toBeNull();
  });

  it('keeps the placeholder text clear of the arrows', () => {
    create(['a.webp', 'b.webp']);
    const el: HTMLElement = fixture.nativeElement;
    // The arrows' worst case: the narrowest gallery the detail draws, a 320 px phone's sheet less
    // its side padding.
    el.style.display = 'block';
    el.style.width = '270px';
    failCurrentImage();
    const lines = Array.from(
      el.querySelectorAll('.gallery__placeholder-line'),
    ).map((line) => line.getBoundingClientRect());
    const arrows = Array.from(el.querySelectorAll('button')).map((button) =>
      button.getBoundingClientRect(),
    );
    expect(lines.length).toBe(2);
    for (const line of lines) {
      for (const arrow of arrows) {
        const overlaps = line.left < arrow.right && line.right > arrow.left;
        expect(overlaps).toBeFalse();
      }
    }
  });

  it('shows the rain while the photo loads', () => {
    create(['a.webp', 'b.webp']);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gallery__loading app-ascii-rain')).not.toBeNull();
    expect(el.querySelector('.gallery__photo')?.classList).not.toContain(
      'gallery__photo--loaded',
    );
  });

  it('crossfades to the photo once it loads', () => {
    create(['a.webp', 'b.webp']);
    loadCurrentImage();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gallery__photo')?.classList).toContain(
      'gallery__photo--loaded',
    );
    expect(el.querySelector('.gallery__loading')).toBeNull();
    expect(el.querySelector('.gallery')?.classList).not.toContain(
      'gallery--instant',
    );
  });

  it('shows an image that is already complete at once', async () => {
    spyOnProperty(HTMLImageElement.prototype, 'complete').and.returnValue(true);
    spyOnProperty(HTMLImageElement.prototype, 'naturalWidth').and.returnValue(
      640,
    );
    create(['a.webp', 'b.webp']);
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gallery__photo')?.classList).toContain(
      'gallery__photo--loaded',
    );
    expect(el.querySelector('.gallery')?.classList).toContain(
      'gallery--instant',
    );
  });

  describe('with only the first photo already complete', () => {
    beforeEach(() => {
      // `complete` and `naturalWidth` follow the element's own src, so only a.webp is cached.
      spyOnProperty(HTMLImageElement.prototype, 'complete').and.callFake(
        function (this: HTMLImageElement) {
          return this.getAttribute('src') === 'a.webp';
        },
      );
      spyOnProperty(HTMLImageElement.prototype, 'naturalWidth').and.callFake(
        function (this: HTMLImageElement) {
          return this.getAttribute('src') === 'a.webp' ? 640 : 0;
        },
      );
    });

    /** Renders and runs the after-render check for whatever slide is on screen. */
    async function settle() {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('crossfades an uncached slide that follows an instant one', async () => {
      const c = create(['a.webp', 'b.webp']);
      await settle();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.gallery')?.classList).toContain(
        'gallery--instant',
      );
      c.next();
      await settle();
      expect(el.querySelector('.gallery')?.classList).not.toContain(
        'gallery--instant',
      );
      expect(el.querySelector('.gallery__loading')).toBeNull();
      expect(el.querySelector('.gallery__outgoing')?.getAttribute('src')).toBe(
        'a.webp',
      );
      expect(el.querySelector('.gallery__photo')?.classList).not.toContain(
        'gallery__photo--loaded',
      );
      loadCurrentImage();
      expect(el.querySelector('.gallery__photo')?.classList).toContain(
        'gallery__photo--loaded',
      );
      expect(el.querySelector('.gallery')?.classList).not.toContain(
        'gallery--instant',
      );
    });

    it('crossfades back to a cached slide instead of cutting to it', async () => {
      const c = create(['a.webp', 'b.webp']);
      await settle();
      c.next();
      await settle();
      loadCurrentImage();
      c.previous();
      await settle();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.gallery')?.classList).not.toContain(
        'gallery--instant',
      );
      expect(el.querySelector('.gallery__photo')?.classList).toContain(
        'gallery__photo--loaded',
      );
      expect(el.querySelector('.gallery__outgoing')?.getAttribute('src')).toBe(
        'b.webp',
      );
      expect(el.querySelector('.gallery__loading')).toBeNull();
    });

    it('keeps the rain from fading out over an instant slide', async () => {
      create(['a.webp', 'b.webp']);
      await settle();
      const el: HTMLElement = fixture.nativeElement;
      // The rain of an instant slide is gone or leaves without a transition; probe the rule that
      // governs it with a stand-in element.
      const gallery = el.querySelector('.gallery')!;
      const rain = document.createElement('div');
      rain.className = 'gallery__loading gallery__loading--leaving';
      // The component's styles are scoped by an attribute the stand-in must carry too.
      for (const name of gallery.getAttributeNames()) {
        if (name.startsWith('_ngcontent')) {
          rain.setAttribute(name, '');
        }
      }
      gallery.appendChild(rain);
      expect(getComputedStyle(rain).transitionDuration).toBe('0s');
    });
  });

  describe('stepping between photos', () => {
    /** A real one-pixel image, so a photo that is given to the page loads and never errors. */
    const PIXEL =
      'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const photos = [`${PIXEL}#a`, `${PIXEL}#b`, `${PIXEL}#c`];

    /** Makes every image count as already complete, the way the rail's cached thumbs do. */
    function cacheEverything() {
      spyOnProperty(HTMLImageElement.prototype, 'complete').and.returnValue(
        true,
      );
      spyOnProperty(HTMLImageElement.prototype, 'naturalWidth').and.returnValue(
        640,
      );
    }

    /** Renders and runs the after-render check for whatever slide is on screen. */
    async function settle() {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    const el = () => fixture.nativeElement as HTMLElement;
    const outgoing = () =>
      el().querySelectorAll<HTMLImageElement>('.gallery__outgoing');
    const incoming = () =>
      el().querySelector<HTMLImageElement>('.gallery__photo')!;

    /** The opacity transitions the browser is running on `image`, with their lengths in ms. */
    function opacityFades(image: HTMLElement): number[] {
      return image
        .getAnimations()
        .filter(
          (animation): animation is CSSTransition =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === 'opacity',
        )
        .map((animation) =>
          Number(animation.effect!.getComputedTiming().duration),
        );
    }

    /** Resolves when `image` has finished fading in, or after a second so a missing fade fails. */
    function fadeEnded(image: HTMLElement): Promise<void> {
      return new Promise((resolve) => {
        image.addEventListener('transitionend', () => resolve(), {
          once: true,
        });
        setTimeout(resolve, 1000);
      });
    }

    it('keeps the outgoing photo under a cached incoming one while it fades in', async () => {
      cacheEverything();
      const c = create(photos);
      await settle();
      c.next();
      await settle();
      expect(outgoing().length).toBe(1);
      expect(outgoing()[0]?.getAttribute('src')).toBe(photos[0]);
      expect(incoming().getAttribute('src')).toBe(photos[1]);
      expect(el().querySelector('.gallery')?.classList).not.toContain(
        'gallery--instant',
      );
      expect(opacityFades(incoming())).toEqual([300]);
      expect(getComputedStyle(incoming()).transitionDuration).toBe('0.3s');
    });

    it('lets the outgoing photo go once the incoming one has faded in', async () => {
      cacheEverything();
      const c = create(photos);
      await settle();
      c.next();
      await settle();
      expect(outgoing().length).toBe(1);
      await fadeEnded(incoming());
      fixture.detectChanges();
      expect(outgoing().length).toBe(0);
      expect(incoming().getAttribute('src')).toBe(photos[1]);
    });

    it('does not fade the first photo, even though it is cached', async () => {
      cacheEverything();
      create(photos);
      await settle();
      expect(el().querySelector('.gallery')?.classList).toContain(
        'gallery--instant',
      );
      expect(incoming().classList).toContain('gallery__photo--loaded');
      expect(opacityFades(incoming())).toEqual([]);
      expect(outgoing().length).toBe(0);
    });

    it('leaves one outgoing layer however fast it is stepped, and none afterwards', async () => {
      cacheEverything();
      const c = create(photos);
      await settle();
      for (let step = 0; step < 5; step++) {
        c.next();
        await settle();
        expect(outgoing().length).toBe(1);
        expect(el().querySelectorAll('img').length).toBe(2);
      }
      await fadeEnded(incoming());
      fixture.detectChanges();
      expect(outgoing().length).toBe(0);
      expect(el().querySelectorAll('img').length).toBe(1);
    });

    it('announces only the photo on screen, and keeps the outgoing layer silent', async () => {
      cacheEverything();
      const c = create(photos);
      await settle();
      c.next();
      await settle();
      expect(incoming().getAttribute('alt')).toBe('Hbf Curb, photo 2 of 3');
      expect(outgoing()[0]?.getAttribute('alt')).toBe('');
      expect(outgoing()[0]?.getAttribute('aria-hidden')).toBe('true');
      const named = Array.from(el().querySelectorAll('img')).filter((image) =>
        image.getAttribute('alt'),
      );
      expect(named.length).toBe(1);
    });

    it('keeps a fade for the step under reduced motion', async () => {
      cacheEverything();
      const c = create(photos);
      await settle();
      c.next();
      await settle();
      // The reduced-motion media query cannot be switched on here, so its rules are read instead:
      // none may switch the stepped-to photo's transition off.
      const switchedOff: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (
            rule instanceof CSSMediaRule &&
            rule.conditionText.includes('prefers-reduced-motion')
          ) {
            for (const inner of Array.from(rule.cssRules)) {
              if (
                inner instanceof CSSStyleRule &&
                incoming().matches(inner.selectorText) &&
                inner.style.getPropertyValue('transition').trim() === 'none'
              ) {
                switchedOff.push(inner.selectorText);
              }
            }
          }
        }
      }
      expect(switchedOff).toEqual([]);
    });

    describe('to a photo that has not loaded', () => {
      beforeEach(() => {
        // Only the first photo is cached; the others stay unloaded until the test loads them.
        spyOnProperty(HTMLImageElement.prototype, 'complete').and.callFake(
          function (this: HTMLImageElement) {
            return this.getAttribute('src') === 'a.webp';
          },
        );
        spyOnProperty(HTMLImageElement.prototype, 'naturalWidth').and.callFake(
          function (this: HTMLImageElement) {
            return this.getAttribute('src') === 'a.webp' ? 640 : 0;
          },
        );
      });

      it('keeps the outgoing photo until the incoming one has loaded and faded in', async () => {
        const c = create(['a.webp', 'b.webp']);
        await settle();
        c.next();
        await settle();
        expect(outgoing().length).toBe(1);
        expect(incoming().classList).not.toContain('gallery__photo--loaded');
        incoming().dispatchEvent(new Event('load'));
        fixture.detectChanges();
        expect(incoming().classList).toContain('gallery__photo--loaded');
        expect(outgoing().length).toBe(1);
        incoming().dispatchEvent(
          new TransitionEvent('transitionend', {
            propertyName: 'opacity',
            bubbles: true,
          }),
        );
        fixture.detectChanges();
        expect(outgoing().length).toBe(0);
      });

      it('ends in the placeholder, without the outgoing photo, when the incoming one fails', async () => {
        const c = create(['a.webp', 'b.webp']);
        await settle();
        c.next();
        await settle();
        expect(outgoing().length).toBe(1);
        failCurrentImage();
        expect(el().querySelector('.gallery__placeholder')).not.toBeNull();
        expect(outgoing().length).toBe(0);
      });
    });
  });

  it('rounds the arrows on the soft radius scale', () => {
    create(['a.webp', 'b.webp']);
    const probe = document.createElement('div');
    probe.style.borderRadius = 'var(--radius-sm)';
    document.body.appendChild(probe);
    const softRadius = getComputedStyle(probe).borderTopLeftRadius;
    probe.remove();
    expect(softRadius).not.toBe('0px');
    const el: HTMLElement = fixture.nativeElement;
    const rounded = Array.from(el.querySelectorAll('.gallery__nav'));
    expect(rounded.length).toBe(2);
    for (const element of rounded) {
      expect(getComputedStyle(element).borderTopLeftRadius).toBe(softRadius);
    }
  });

  it('shows the rain only where no photo has been on screen to step away from', () => {
    const c = create(['a.webp', 'b.webp', 'c.webp']);
    // Stepping away from a slide that never loaded leaves nothing to keep, so the rain stays.
    c.next();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.gallery__loading'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('.gallery__outgoing'),
    ).toBeNull();
    // Stepping away from a loaded slide keeps that photo on screen while the next one loads.
    loadCurrentImage();
    c.next();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.gallery__loading')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.gallery__outgoing'),
    ).not.toBeNull();
    // A slide that has loaded never shows the rain again.
    c.previous();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.gallery__loading')).toBeNull();
  });

  it('stays 4:3 at the width its host gives it', () => {
    create(['a.webp', 'b.webp']);
    const el: HTMLElement = fixture.nativeElement;
    el.style.width = '320px';
    const gallery: HTMLElement = el.querySelector('.gallery')!;
    expect(gallery.offsetWidth).toBe(320);
    expect(gallery.offsetHeight).toBe(240);
  });

  it('sits the plates 8 px inside the photo’s edges', () => {
    create(['a.webp', 'b.webp']);
    const el: HTMLElement = fixture.nativeElement;
    el.style.display = 'block';
    el.style.width = '320px';
    const panel = el.querySelector<HTMLElement>('.gallery')!;
    // The photo starts inside the panel's 1 px line frame.
    const frame = panel.clientLeft;
    const gallery = panel.getBoundingClientRect();
    const prev = el
      .querySelector('.gallery__nav--prev')!
      .getBoundingClientRect();
    const next = el
      .querySelector('.gallery__nav--next')!
      .getBoundingClientRect();
    expect(prev.left - gallery.left - frame).toBe(8);
    expect(gallery.right - frame - next.right).toBe(8);
  });

  it('fades the plates out and makes them inert while its controls are off', () => {
    create(['a.webp', 'b.webp']);
    const el: HTMLElement = fixture.nativeElement;
    const controls = () => el.querySelector<HTMLElement>('.gallery__controls')!;
    expect(controls().classList).not.toContain('gallery__controls--hidden');
    expect(controls().inert).toBeFalse();

    fixture.componentRef.setInput('controls', false);
    fixture.detectChanges();
    expect(controls().classList).toContain('gallery__controls--hidden');
    expect(controls().inert).toBeTrue();
    expect(getComputedStyle(controls()).transitionProperty).toContain(
      'opacity',
    );

    fixture.componentRef.setInput('controls', true);
    fixture.detectChanges();
    expect(controls().classList).not.toContain('gallery__controls--hidden');
    expect(controls().inert).toBeFalse();
  });

  describe('with full-size photos', () => {
    /** Renders the gallery with thumbs and their full-size versions. */
    function createWithFull() {
      fixture = TestBed.createComponent(SpotPhotoGalleryComponent);
      fixture.componentRef.setInput('photos', ['a.webp', 'b.webp']);
      fixture.componentRef.setInput('fullPhotos', [
        'a-full.webp',
        'b-full.webp',
      ]);
      fixture.componentRef.setInput('spotName', 'Hbf Curb');
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    /** Fires `type` on the image matching `selector`. */
    function fire(selector: string, type: 'load' | 'error') {
      fixture.nativeElement
        .querySelector(selector)
        .dispatchEvent(new Event(type));
      fixture.detectChanges();
    }

    const el = () => fixture.nativeElement as HTMLElement;

    it('lays the full-size photo over the thumb and crossfades it in once it loads', () => {
      createWithFull();
      const full = el().querySelector<HTMLImageElement>('.gallery__full')!;
      expect(full.getAttribute('src')).toBe('a-full.webp');
      expect(full.getAttribute('alt')).toBe('');
      expect(full.classList).not.toContain('gallery__full--loaded');
      expect(getComputedStyle(full).transitionProperty).toContain('opacity');

      fire('.gallery__photo', 'load');
      fire('.gallery__full', 'load');
      expect(el().querySelector('.gallery__full')?.classList).toContain(
        'gallery__full--loaded',
      );
      expect(el().querySelector('.gallery__photo')).not.toBeNull();
    });

    it('keeps the thumb when the full-size photo fails', () => {
      createWithFull();
      fire('.gallery__photo', 'load');
      fire('.gallery__full', 'error');
      expect(el().querySelector('.gallery__full')).toBeNull();
      expect(el().querySelector('.gallery__photo')?.classList).toContain(
        'gallery__photo--loaded',
      );
      expect(el().querySelector('.gallery__placeholder')).toBeNull();
    });

    it('shows the placeholder while the thumb is broken and no full-size photo has loaded', () => {
      createWithFull();
      fire('.gallery__photo', 'error');
      expect(el().querySelector('.gallery__placeholder')).not.toBeNull();
      expect(el().querySelector('.gallery__full')).not.toBeNull();

      fire('.gallery__full', 'load');
      expect(el().querySelector('.gallery__placeholder')).toBeNull();
      expect(el().querySelector('.gallery__full')?.classList).toContain(
        'gallery__full--loaded',
      );
    });

    it('shows the rain until either photo has loaded', () => {
      createWithFull();
      expect(el().querySelector('.gallery__loading')).not.toBeNull();
      fire('.gallery__full', 'load');
      expect(el().querySelector('.gallery__loading')).toBeNull();
    });

    it('asks only for the full-size photo of the slide on screen', () => {
      const c = createWithFull();
      c.next();
      fixture.detectChanges();
      expect(el().querySelector('.gallery__full')?.getAttribute('src')).toBe(
        'b-full.webp',
      );
      expect(el().querySelectorAll('.gallery__full').length).toBe(1);
    });

    it('shows a full-size photo that is already complete at once', async () => {
      spyOnProperty(HTMLImageElement.prototype, 'complete').and.callFake(
        function (this: HTMLImageElement) {
          return this.getAttribute('src') === 'a-full.webp';
        },
      );
      spyOnProperty(HTMLImageElement.prototype, 'naturalWidth').and.callFake(
        function (this: HTMLImageElement) {
          return this.getAttribute('src') === 'a-full.webp' ? 1400 : 0;
        },
      );
      createWithFull();
      await fixture.whenStable();
      fixture.detectChanges();
      const full = el().querySelector('.gallery__full')!;
      expect(full.classList).toContain('gallery__full--loaded');
      expect(full.classList).toContain('gallery__full--instant');
      expect(el().querySelector('.gallery__loading')).toBeNull();
    });
  });

  it('keeps its whole width when a photo breaks, so the panel never collapses', () => {
    create(['a.webp', 'b.webp']);
    const el: HTMLElement = fixture.nativeElement;
    el.style.width = '320px';
    failCurrentImage();
    expect(el.querySelector<HTMLElement>('.gallery')!.offsetWidth).toBe(320);
  });

  it('fails only the photo that broke', () => {
    const c = create(['a.webp', 'b.webp', 'c.webp']);
    c.next();
    fixture.detectChanges();
    failCurrentImage();
    c.next();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'c.webp',
    );
  });

  /** What the browser paints for a token value of `property`. */
  function painted(property: 'text-shadow', value: string): string {
    const probe = document.createElement('span');
    probe.style.setProperty(property, value);
    document.body.appendChild(probe);
    const result = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return result;
  }

  it('gives the arrows the shared bloom, kept inside the gallery', () => {
    create(['a.webp', 'b.webp']);
    for (const arrow of fixture.nativeElement.querySelectorAll(
      '.gallery__nav',
    )) {
      expect(arrow.classList).toContain('phosphor-bloom');
      expect(arrow.classList).toContain('phosphor-bloom--inset');
      expect(arrow.classList).toContain('phosphor-bloom--plate');
    }
  });

  it('lights SIGNAL LOST in the Standard tier and leaves the dim line unlit', () => {
    create(['a.webp']);
    failCurrentImage();
    const [line, dim] = fixture.nativeElement.querySelectorAll(
      '.gallery__placeholder-line',
    );
    expect(getComputedStyle(line).textShadow).toBe(
      painted('text-shadow', 'var(--glow-text-standard)'),
    );
    expect(getComputedStyle(dim).textShadow).toBe('none');
  });
});

/** A page binding the gallery's slide two-way, the way the spot detail's strip does. */
@Component({
  imports: [SpotPhotoGalleryComponent],
  template: `<app-spot-photo-gallery
    [photos]="photos()"
    spotName="Hbf Curb"
    [(index)]="index"
  />`,
})
class TwoWayHostComponent {
  readonly photos = signal(['a.webp', 'b.webp', 'c.webp']);
  readonly index = signal(0);
}

describe('SpotPhotoGalleryComponent bound two-way', () => {
  let fixture: ComponentFixture<TwoWayHostComponent>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(TwoWayHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The alt text of the photo on screen, which names its place in the list. */
  const alt = () =>
    fixture.nativeElement.querySelector('.gallery__photo')?.getAttribute('alt');

  it('shows the slide its host sets', async () => {
    fixture.componentInstance.index.set(2);
    await settle();
    expect(alt()).toBe('Hbf Curb, photo 3 of 3');
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'c.webp',
    );
  });

  it('reports an arrow press back to its host', async () => {
    fixture.nativeElement.querySelector('.gallery__nav--next').click();
    await settle();
    expect(fixture.componentInstance.index()).toBe(1);
  });

  it('moves an index past a shorter photo list onto its last photo', async () => {
    fixture.componentInstance.index.set(2);
    await settle();
    fixture.componentInstance.photos.set(['a.webp', 'b.webp']);
    await settle();
    expect(alt()).toBe('Hbf Curb, photo 2 of 2');
    expect(fixture.componentInstance.index()).toBe(1);
  });
});
