import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';

@Component({
    selector: 'app-about',
    imports: [AsciiAnimationTextComponent],
    templateUrl: './about.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './about.component.css'
})
export class AboutComponent {

}
