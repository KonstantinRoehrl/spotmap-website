import { Component, ChangeDetectionStrategy } from '@angular/core';

import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';

/** The README page: how to use the map, why it looks like 1983, credits, the photo rights notice and the disclaimer — static copy in the terminal window. */
@Component({
  selector: 'app-about',
  imports: [PointerBloomDirective],
  templateUrl: './about.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../terminal-window.css', './about.component.css'],
})
export class AboutComponent {}
