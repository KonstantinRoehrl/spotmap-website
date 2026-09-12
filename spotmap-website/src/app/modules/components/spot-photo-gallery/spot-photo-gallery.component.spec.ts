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
});
