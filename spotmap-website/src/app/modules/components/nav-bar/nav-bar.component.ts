import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsciiAnimationTextComponent } from '../ascii-animation-text/ascii-animation-text.component';
import { GlitchTextDirective } from '../../directives/glitch-text.directive';

@Component({
  selector: 'app-nav-bar',
  standalone: true,
  imports: [RouterLink, AsciiAnimationTextComponent, GlitchTextDirective],
  templateUrl: './nav-bar.component.html',
  styleUrls: ['./nav-bar.component.css']
})
export class NavBarComponent implements OnInit, OnDestroy {
  @Input() links: { name: string; url: string }[] = [];

  glitchedIndex: number | null = null;
  private interval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    // Rare glitch effect (about every 4–6 seconds)
    this.interval = setInterval(() => {
      if (Math.random() < 0.15 && this.links.length > 0) {
        this.glitchedIndex = Math.floor(Math.random() * this.links.length);
        setTimeout(() => (this.glitchedIndex = null), 500); // reset glitch after 0.5s
      }
    }, 4000);
  }

  ngOnDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }
}
