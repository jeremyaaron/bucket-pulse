import { Component } from '@angular/core';
import { AsyncPipe, NgFor } from '@angular/common';
import { BpToastService, Toast } from './bp-toast.service';

@Component({
  selector: 'bp-toast-container',
  standalone: true,
  imports: [NgFor, AsyncPipe],
  template: `
    <div class="bp-toast-container">
      <div
        class="bp-toast"
        *ngFor="let toast of toasts$ | async"
        [class.bp-toast--success]="toast.variant === 'success'"
        [class.bp-toast--error]="toast.variant === 'error'"
        [class.bp-toast--info]="toast.variant === 'info'"
      >
        <span>{{ toast.message }}</span>
        <button type="button" (click)="dismiss(toast)">×</button>
      </div>
    </div>
  `,
  styleUrls: ['./bp-toast.component.scss'],
})
export class BpToastComponent {
  toasts$ = this.toastService.stream;

  constructor(private readonly toastService: BpToastService) {}

  dismiss(toast: Toast) {
    this.toastService.dismiss(toast.id);
  }
}
