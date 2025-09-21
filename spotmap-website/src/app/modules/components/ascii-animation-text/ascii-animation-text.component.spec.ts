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
});
