import { Component } from '@angular/core';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [AsciiAnimationTextComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css'
})
export class AboutComponent {

}
