import { AfterViewInit, Component, HostListener, input } from '@angular/core';
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
export class NavBarComponent implements AfterViewInit {
  links = input<NavBarLink[]>([]);
  private touchTimeouts = new WeakMap<HTMLElement, any>();
  private ignoreMouse = false; // <-- flag to ignore mouse after touch

  activeLink: string = "";

  ngAfterViewInit() {
    this.activeLink = "Map"
  }

  /** Set clicked link as active */
  setActive(link: NavBarLink) {
    this.activeLink = link.name;
  }

  /** Check if a link is active */
  isActive(link: NavBarLink) {
    return this.activeLink === link.name;
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.ignoreMouse) return;
    const target = event.target as HTMLElement;
    const link = target.closest('a');
    if (!link) return;

    const rect = link.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    link.style.setProperty('--mouse-x', `${x}%`);
    link.style.setProperty('--mouse-y', `${y}%`);
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    this.ignoreMouse = true;
    const touch = event.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
    const link = target?.closest('a');
    if (!link) return;

    // Clear any previous timer
    if (this.touchTimeouts.has(link)) {
      clearTimeout(this.touchTimeouts.get(link));
      this.touchTimeouts.delete(link);
    }

    // Set radial gradient coordinates
    const rect = link.getBoundingClientRect();
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;

    // Apply touch glow
    link.classList.add('touch-glow');

    // Remove touch-glow after fade duration
    const fadeDuration = 1000; // match CSS ::after transition
    const timeout = setTimeout(() => {
      link.classList.remove('touch-glow');
      this.touchTimeouts.delete(link);
    }, fadeDuration);

    this.touchTimeouts.set(link, timeout);

    // Ignore synthetic mouse events for a short time
    setTimeout(() => (this.ignoreMouse = false), 500);
  }
}