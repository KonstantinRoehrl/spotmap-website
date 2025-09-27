import { Component, HostListener, input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GlitchTextDirective } from '../../directives/glitch-text.directive';
import { AsciiAnimationTextComponent } from '../ascii-animation-text/ascii-animation-text.component';

export interface NavBarLink {
  name: string,
  url: string,
  icon: string,
}


@Component({
  selector: 'app-nav-bar',
  standalone: true,
  imports: [RouterLink, AsciiAnimationTextComponent, GlitchTextDirective],
  templateUrl: './nav-bar.component.html',
  styleUrls: ['./nav-bar.component.css']
})
export class NavBarComponent implements OnInit {
  links = input<NavBarLink[]>([]);
  private touchTimeouts = new WeakMap<HTMLElement, any>();

  ngOnInit(): void { }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const link = target.closest('a');

    if (link) {
      const rect = link.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;

      link.style.setProperty('--mouse-x', `${x}%`);
      link.style.setProperty('--mouse-y', `${y}%`);
    }
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    console.log("touch")
    const touch = event.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
    const link = target?.closest('a');

    if (link) {
      const rect = link.getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 100;
      const y = ((touch.clientY - rect.top) / rect.height) * 100;

      link.style.setProperty('--mouse-x', `${x}%`);
      link.style.setProperty('--mouse-y', `${y}%`);

      // Add touch-glow class
      link.classList.add('touch-glow');

      // Remove after fade-out duration
      if (this.touchTimeouts.has(link)) {
        clearTimeout(this.touchTimeouts.get(link));
      }

      // Use next frame to force transition start
      requestAnimationFrame(() => {
        const timeout = setTimeout(() => link.classList.remove('touch-glow'), 1000);
        this.touchTimeouts.set(link, timeout);
      });
    }
  }
}