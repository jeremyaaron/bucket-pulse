import { Component, Input } from '@angular/core';

type BpButtonVariant = 'primary' | 'secondary' | 'ghost';

@Component({
  selector: 'bp-button',
  standalone: true,
  template: `
    <button
      class="bp-button"
      [class.bp-button--primary]="variant === 'primary'"
      [class.bp-button--secondary]="variant === 'secondary'"
      [class.bp-button--ghost]="variant === 'ghost'"
      [disabled]="disabled"
      [attr.type]="type"
    >
      <ng-content />
    </button>
  `,
  styleUrls: ['./bp-button.component.scss'],
})
export class BpButtonComponent {
  @Input() variant: BpButtonVariant = 'primary';
  @Input() disabled = false;
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
}
