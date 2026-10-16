import { Component, ChangeDetectionStrategy } from '@angular/core';

/** The README page: how to use the map, why it looks like 1983, credits, the photo rights notice and the disclaimer — static copy in the terminal window. */
@Component({
  selector: 'app-about',
  imports: [],
  templateUrl: './about.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../terminal-window.css', './about.component.css'],
})
export class AboutComponent {}
