import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SpotPhotoFailedComponent } from './spot-photo-failed.component';

@Component({
  imports: [SpotPhotoFailedComponent],
  template: `
    <app-spot-photo-failed class="silent" />
    <app-spot-photo-failed class="named" label="Hbf Curb, did not load" />
  `,
})
class HostComponent {}

describe('SpotPhotoFailedComponent', () => {
  function hosts() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return {
      silent: el.querySelector('.silent')!,
      named: el.querySelector('.named')!,
    };
  }

  it('says both lines, separated by a space', () => {
    expect(hosts().silent.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '> SIGNAL LOST PHOTO UNREACHABLE',
    );
  });

  it('is an image with a name when given a label', () => {
    const { named } = hosts();
    expect(named.getAttribute('role')).toBe('img');
    expect(named.getAttribute('aria-label')).toBe('Hbf Curb, did not load');
    expect(named.hasAttribute('aria-hidden')).toBeFalse();
  });

  it('is hidden from assistive technology without a label', () => {
    const { silent } = hosts();
    expect(silent.getAttribute('aria-hidden')).toBe('true');
    expect(silent.hasAttribute('role')).toBeFalse();
    expect(silent.hasAttribute('aria-label')).toBeFalse();
  });
});
