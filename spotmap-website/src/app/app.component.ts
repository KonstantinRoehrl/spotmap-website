import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AsciiAnimationTextComponent } from './modules/components/ascii-animation-text/ascii-animation-text.component';
import { NavBarComponent } from './modules/components/nav-bar/nav-bar.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, AsciiAnimationTextComponent, NavBarComponent],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'spotmap-website';
  protected introFinished = signal<boolean>(false);

  constructor(private router: Router){

  }

  protected onIntroFinished(): void {
    void this.router.navigate(["map"]).then(() => this.introFinished.set(true));
  }

}
