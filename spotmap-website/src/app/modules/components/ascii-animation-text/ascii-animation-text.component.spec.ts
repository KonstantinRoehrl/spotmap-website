import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AsciiAnimationTextComponent } from './ascii-animation-text.component';

describe('AsciiAnimationTextComponent', () => {
  let component: AsciiAnimationTextComponent;
  let fixture: ComponentFixture<AsciiAnimationTextComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsciiAnimationTextComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AsciiAnimationTextComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('removes its window resize listener on destroy', () => {
    const added = new Map<string, EventListenerOrEventListenerObject>();
    spyOn(window, 'addEventListener').and.callFake(
      (type: string, cb: EventListenerOrEventListenerObject) => added.set(type, cb),
    );
    const removeSpy = spyOn(window, 'removeEventListener').and.callThrough();

    const f = TestBed.createComponent(AsciiAnimationTextComponent);
    f.detectChanges(); // triggers ngAfterViewInit -> addEventListener('resize', ...)
    const handler = added.get('resize');
    expect(handler).withContext('resize listener should be registered').toBeDefined();

    f.destroy();

    expect(removeSpy).toHaveBeenCalledWith('resize', handler!);
  });
});
