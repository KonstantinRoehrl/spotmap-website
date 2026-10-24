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

  it('shows the first photo and a 1-of-n counter', () => {
    create(['a.webp', 'b.webp', 'c.webp']);
    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('src')).toBe('a.webp');
    expect(fixture.nativeElement.textContent).toContain('[1/3]');
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

  it('hides the counter and the arrows for a single photo', () => {
    create(['only.webp']);
    expect(fixture.nativeElement.textContent).not.toContain('[1/1]');
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
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

  it('keeps the counter and the arrows working past a broken photo', () => {
    const c = create(['a.webp', 'b.webp']);
    failCurrentImage();
    expect(fixture.nativeElement.textContent).toContain('[1/2]');
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(2);
    c.next();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'b.webp',
    );
    expect(fixture.nativeElement.textContent).toContain('[2/2]');
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
      expect(
        el.querySelector('.gallery__loading app-ascii-rain'),
      ).not.toBeNull();
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

    it('shows the cached slide at once again when swiping back to it', async () => {
      const c = create(['a.webp', 'b.webp']);
      await settle();
      c.next();
      await settle();
      loadCurrentImage();
      c.previous();
      await settle();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.gallery')?.classList).toContain(
        'gallery--instant',
      );
      expect(el.querySelector('.gallery__photo')?.classList).toContain(
        'gallery__photo--loaded',
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

  it('rounds the arrows and the counter on the soft radius scale', () => {
    create(['a.webp', 'b.webp']);
    const probe = document.createElement('div');
    probe.style.borderRadius = 'var(--radius-sm)';
    document.body.appendChild(probe);
    const softRadius = getComputedStyle(probe).borderTopLeftRadius;
    probe.remove();
    expect(softRadius).not.toBe('0px');
    const el: HTMLElement = fixture.nativeElement;
    const rounded = [
      ...Array.from(el.querySelectorAll('.gallery__nav')),
      el.querySelector('.gallery__counter')!,
    ];
    expect(rounded.length).toBe(3);
    for (const element of rounded) {
      expect(getComputedStyle(element).borderTopLeftRadius).toBe(softRadius);
    }
  });

  it('shows the rain again for a slide not yet loaded, never for one that has', () => {
    const c = create(['a.webp', 'b.webp']);
    loadCurrentImage();
    c.next();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.gallery__loading'),
    ).not.toBeNull();
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

  it('leaves the counter unlit', () => {
    create(['a.webp', 'b.webp']);
    const counter = fixture.nativeElement.querySelector('.gallery__counter');
    expect(getComputedStyle(counter).textShadow).toBe('none');
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

  const counter = () =>
    (
      fixture.nativeElement.querySelector('.gallery__counter')?.textContent ??
      ''
    ).trim();

  it('shows the slide its host sets', async () => {
    fixture.componentInstance.index.set(2);
    await settle();
    expect(counter()).toBe('[3/3]');
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
    expect(counter()).toBe('[2/2]');
    expect(fixture.componentInstance.index()).toBe(1);
  });
});
