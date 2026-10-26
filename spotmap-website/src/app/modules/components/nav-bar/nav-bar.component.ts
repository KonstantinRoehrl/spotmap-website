import {
  Component,
  input,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { GlitchTextDirective } from '../../directives/glitch-text.directive';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';

/** One entry of the nav bar: its label, its route, and the terminal glyph shown beside it. */
export interface NavBarLink {
  name: string;
  url: string;
  icon: string;
  /**
   * A path prefix under which this link is lit as well as on its own `url`, e.g. `/spot/` for the
   * Map tab, since a spot link shows the map page. Unset, the link is lit on its own URL only.
   */
  activeAlsoUnder?: string;
}

/** A router URL without its query string and fragment, which never decide the current page. */
function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

/**
 * The site's tab bar — top on desktop, a fixed bottom bar on phones. Each link wears the shared
 * pointer bloom; the current page's link rests in a quiet lit state (the `active` class).
 *
 * The lit state is worked out here rather than by `RouterLinkActive`. That directive only
 * compares the URL with the link's own `routerLink` tree (exactly or as a subset), so it cannot
 * light the Map tab on `/spot/<id>`, which is a different path showing the same page.
 */
@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, GlitchTextDirective, PointerBloomDirective],
  templateUrl: './nav-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./nav-bar.component.css'],
})
export class NavBarComponent {
  /** The links, in display order. */
  links = input<NavBarLink[]>([]);

  private readonly router = inject(Router);

  /** The current page's path, query string and fragment dropped; follows every finished navigation. */
  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => pathOf(event.urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );

  /** Whether `link` belongs to the current page: its own URL, or a path under its `activeAlsoUnder`. */
  protected isActive(link: NavBarLink): boolean {
    const path = this.currentPath();
    return (
      path === link.url ||
      (link.activeAlsoUnder !== undefined &&
        path.startsWith(link.activeAlsoUnder))
    );
  }
}
