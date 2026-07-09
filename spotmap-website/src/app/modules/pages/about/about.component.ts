import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-about',
  imports: [],
  templateUrl: './about.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../terminal-window.css', './about.component.css'],
})
export class AboutComponent {}
