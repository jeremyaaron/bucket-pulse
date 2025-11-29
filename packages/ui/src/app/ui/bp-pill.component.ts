import { Component, Input } from '@angular/core';

export type BpPillVariant = 'ok' | 'warning' | 'critical' | 'unknown' | 'neutral';

@Component({
  selector: 'bp-pill',
  standalone: true,
  template: `
    <span
      class="bp-pill"
      [class.bp-pill--ok]="variant === 'ok'"
      [class.bp-pill--warning]="variant === 'warning'"
      [class.bp-pill--critical]="variant === 'critical'"
      [class.bp-pill--unknown]="variant === 'unknown'"
      [class.bp-pill--neutral]="variant === 'neutral'"
    >
      <ng-content />
    </span>
  `,
  styleUrls: ['./bp-pill.component.scss'],
})
export class BpPillComponent {
  @Input() variant: BpPillVariant = 'neutral';
}
