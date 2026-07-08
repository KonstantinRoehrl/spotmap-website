import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';

@Component({
    selector: 'app-home',
    imports: [AsciiAnimationTextComponent],
    templateUrl: './home.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './home.component.css'
})
export class HomeComponent {

}
