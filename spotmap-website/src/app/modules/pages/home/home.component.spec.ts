import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** What the browser paints for `token` on `property`, for comparing against a computed style. */
  function painted(property: 'text-shadow', token: string): string {
    const probe = document.createElement('span');
    probe.style.setProperty(property, token);
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return value;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lights the page title in the Display tier', () => {
    const title = fixture.nativeElement.querySelector('.term-title');
    expect(getComputedStyle(title).textShadow).toBe(
      painted('text-shadow', 'var(--glow-text-display)'),
    );
  });

  it('gives ENTER THE MAP the shared pointer bloom', () => {
    const enter = fixture.nativeElement.querySelector('.enter-map');
    expect(enter.classList).toContain('phosphor-bloom');
  });
});
