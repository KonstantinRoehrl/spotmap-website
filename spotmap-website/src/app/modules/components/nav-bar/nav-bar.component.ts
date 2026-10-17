import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GlitchTextDirective } from '../../directives/glitch-text.directive';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';

/** One entry of the nav bar: its label, its route, and the terminal glyph shown beside it. */
export interface NavBarLink {
  name: string;
  url: string;
  icon: string;
}

/**
 * The site's tab bar — top on desktop, a fixed bottom bar on phones. Each link wears the shared
 * pointer bloom; the current route's link rests in a quiet lit state.
 */
@Component({
  selector: 'app-nav-bar',
  imports: [
    RouterLink,
    RouterLinkActive,
    GlitchTextDirective,
    PointerBloomDirective,
  ],
  templateUrl: './nav-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./nav-bar.component.css'],
})
export class NavBarComponent {
  /** The links, in display order. */
  links = input<NavBarLink[]>([]);
}
