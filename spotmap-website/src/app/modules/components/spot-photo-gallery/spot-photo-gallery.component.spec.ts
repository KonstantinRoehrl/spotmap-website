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
    // The narrowest panel a popup produces, the arrows' worst case.
    el.style.display = 'block';
    el.style.width = '160px';
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

  it('claims the popup width itself, so a broken photo does not shrink the popup', () => {
    create(['a.webp', 'b.webp']);
    failCurrentImage();
    const gallery = fixture.nativeElement.querySelector('.gallery');
    expect(getComputedStyle(gallery).maxWidth).toBe('302px');
    expect(getComputedStyle(gallery).width).not.toBe('auto');
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
});
