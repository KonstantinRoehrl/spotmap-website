import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';

/** The landing page: the terminal manifesto, the care notice and the way into the map. */
@Component({
  selector: 'app-home',
  imports: [RouterLink, PointerBloomDirective],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../terminal-window.css', './home.component.css'],
})
export class HomeComponent {}
