import { Component } from '@angular/core';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [AsciiAnimationTextComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {

}
