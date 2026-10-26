import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { PointerBloomDirective } from '../../directives/pointer-bloom.directive';

/**
 * The detail's way back to the list: one plate reading `< OVERVIEW`, drawn 32 px tall with a 44 px
 * target, shared by the wide column's toolbar and the phone sheet's head so the two cannot drift
 * apart. It carries no count: it names where it goes, not what is there.
 */
@Component({
  selector: 'app-overview-back',
  imports: [PointerBloomDirective],
  templateUrl: './overview-back.component.html',
  styleUrl: './overview-back.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-flex' },
})
export class OverviewBackComponent {
  /** The plate was activated (click, Enter or Space): the pane should return to the list. */
  readonly back = output<void>();
}
