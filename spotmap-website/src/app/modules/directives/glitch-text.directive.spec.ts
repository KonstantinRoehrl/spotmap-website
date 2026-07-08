import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GlitchTextDirective } from './glitch-text.directive';

@Component({
    imports: [GlitchTextDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<a appGlitchText><span class="nav-text">Map</span></a>`
})
class HostComponent {}

describe('GlitchTextDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('disconnects its MutationObserver on destroy', () => {
    const disconnectSpy = spyOn(MutationObserver.prototype, 'disconnect').and.callThrough();
    fixture.destroy();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
