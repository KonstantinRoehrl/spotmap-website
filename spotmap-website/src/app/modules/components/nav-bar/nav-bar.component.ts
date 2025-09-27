import { Component, input, OnInit } from '@angular/core';
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
}
