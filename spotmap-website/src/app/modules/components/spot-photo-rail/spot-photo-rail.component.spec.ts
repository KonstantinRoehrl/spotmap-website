import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpotPhotoRailComponent } from './spot-photo-rail.component';

/** The rail in a 320 px panel padded by the 16 px panel inset, as the detail holds it. */
@Component({
  imports: [SpotPhotoRailComponent],
  template: `
    <div class="panel" style="display:block;width:320px;padding:16px">
      <app-spot-photo-rail
        [photos]="photos()"
        spotName="Hbf Curb"
        (open)="opened.push($event)"
      />
    </div>
  `,
})
class HostComponent {
  readonly photos = signal<readonly string[]>(['a.webp', 'b.webp', 'c.webp']);
  readonly opened: number[] = [];
  readonly rail = viewChild.required(SpotPhotoRailComponent);
}

/** What the browser paints for a colour token, to compare against computed styles. */
function painted(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = token;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

describe('SpotPhotoRailComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  function create(
    photos: readonly string[] = ['a.webp', 'b.webp', 'c.webp'],
  ): HostComponent {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.photos.set(photos);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  afterEach(() => fixture?.destroy());

  const el = () => fixture.nativeElement as HTMLElement;
  const buttons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('.rail__photo'));
  const images = () =>
    Array.from(el().querySelectorAll<HTMLImageElement>('.rail__img'));

  /** Renders and runs the after-render check for images that are already complete. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows every photo as a button named for opening it, in order', () => {
    create();
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Open photo 1 of 3',
      'Open photo 2 of 3',
      'Open photo 3 of 3',
    ]);
    expect(buttons().every((b) => b.type === 'button')).toBeTrue();
    expect(images().map((img) => img.getAttribute('src'))).toEqual([
      'a.webp',
      'b.webp',
      'c.webp',
    ]);
    // The button carries the name; the image inside it adds nothing to read.
    expect(images().map((img) => img.getAttribute('alt'))).toEqual([
      '',
      '',
      '',
    ]);
  });

  it('groups the photos under the spot’s name', () => {
    create();
    const group = el().querySelector('.rail')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Photos of Hbf Curb');
  });

  it('shows one frame for a single photo', () => {
    create(['only.webp']);
    expect(buttons().length).toBe(1);
    expect(buttons()[0].getAttribute('aria-label')).toBe('Open photo 1 of 1');
  });

  it('reports the photo chosen', () => {
    const host = create();
    buttons()[1].click();
    buttons()[0].click();
    expect(host.opened).toEqual([1, 0]);
  });

  it('hands out the button showing a photo, and nothing past the last one', () => {
    const host = create();
    expect(host.rail().photoButton(0)).toBe(buttons()[0]);
    expect(host.rail().photoButton(2)).toBe(buttons()[2]);
    expect(host.rail().photoButton(3)).toBeNull();
    expect(host.rail().photoButton(-1)).toBeNull();
  });

  it('shows the rain in a frame until its photo loads, then crossfades the photo in', () => {
    create();
    expect(
      buttons()[0].querySelector('.rail__loading app-ascii-rain'),
    ).not.toBeNull();
    expect(images()[0].classList).not.toContain('rail__img--loaded');
    images()[0].dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(images()[0].classList).toContain('rail__img--loaded');
    expect(buttons()[0].querySelector('.rail__loading')).toBeNull();
    // The others are still loading.
    expect(buttons()[1].querySelector('.rail__loading')).not.toBeNull();
    const style = getComputedStyle(images()[0]);
    expect(style.transitionProperty).toContain('opacity');
    expect(style.transitionDuration).toBe('0.3s');
  });

  it('shows a photo already complete on render at once, without the fade', async () => {
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
    create();
    await settle();
    expect(buttons()[0].querySelector('img')?.classList).toContain(
      'rail__img--loaded',
    );
    expect(buttons()[0].classList).toContain('rail__photo--instant');
    expect(buttons()[1].classList).not.toContain('rail__photo--instant');
  });

  it('turns a photo that fails into the gallery’s placeholder, and keeps it a button', () => {
    create();
    images()[1].dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const failed = buttons()[1];
    expect(failed.querySelector('img')).toBeNull();
    expect(
      failed
        .querySelector('.rail__failed')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('> SIGNAL LOST PHOTO UNREACHABLE');
    expect(failed.getAttribute('aria-label')).toBe(
      'Open photo 2 of 3, did not load',
    );
    // The others carry on.
    expect(buttons()[0].querySelector('img')).not.toBeNull();
    expect(buttons()[2].querySelector('img')).not.toBeNull();
  });

  it('draws 4:3 frames 8 px apart, at the rail height for the layout', () => {
    create();
    const height = window.matchMedia('(min-width: 1024px)').matches ? 132 : 112;
    const [first, second] = buttons().map((b) => b.getBoundingClientRect());
    expect(first.height).toBe(height);
    expect(first.width).toBeCloseTo((height * 4) / 3, 0);
    expect(second.left - first.right).toBeCloseTo(8, 1);
    const style = getComputedStyle(buttons()[0]);
    expect(style.borderTopWidth).toBe('1px');
    expect(style.borderTopColor).toBe(painted('var(--color-line)'));
    expect(style.borderTopLeftRadius).toBe('6px');
  });

  it('bleeds to the panel’s edges and starts its first photo at the 16 px inset', () => {
    create();
    const panel = el().querySelector('.panel')!.getBoundingClientRect();
    const scroller = el().querySelector('.rail')!.getBoundingClientRect();
    expect(scroller.left).toBe(panel.left);
    expect(scroller.right).toBe(panel.right);
    expect(buttons()[0].getBoundingClientRect().left).toBe(panel.left + 16);
  });

  it('scrolls sideways natively and snaps each photo to the inset', () => {
    create();
    const scroller = getComputedStyle(el().querySelector('.rail')!);
    expect(scroller.overflowX).toBe('auto');
    expect(scroller.scrollSnapType).toBe('x mandatory');
    expect(scroller.scrollPaddingLeft).toBe('16px');
    expect(getComputedStyle(buttons()[0]).scrollSnapAlign).toBe('start');
    expect(el().querySelector('.rail')!.scrollWidth).toBeGreaterThan(
      el().querySelector('.rail')!.clientWidth,
    );
  });

  it('wears the inset pointer bloom on every photo', () => {
    create();
    for (const button of buttons()) {
      expect(button.classList).toContain('phosphor-bloom');
      expect(button.classList).toContain('phosphor-bloom--inset');
    }
  });

  it('uses no amber: nothing in the rail is the current selection', () => {
    create();
    images()[2].dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const amber = painted('var(--color-amber)');
    for (const element of Array.from(el().querySelectorAll('*'))) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        for (const property of [
          'color',
          'border-top-color',
          'background-color',
          'text-shadow',
          'box-shadow',
        ]) {
          expect(style.getPropertyValue(property))
            .withContext(`${element.className}${pseudo ?? ''} ${property}`)
            .not.toContain(amber);
        }
      }
    }
  });

  it('sets no text below 12 px', () => {
    create();
    images()[0].dispatchEvent(new Event('error'));
    fixture.detectChanges();
    for (const element of Array.from(
      el().querySelectorAll('.rail__failed, .rail__failed *'),
    )) {
      expect(parseFloat(getComputedStyle(element).fontSize))
        .withContext(element.className)
        .toBeGreaterThanOrEqual(12);
    }
  });
});
