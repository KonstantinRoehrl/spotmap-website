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

  ngOnInit(): void {

  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    // Only apply on desktop
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
}
