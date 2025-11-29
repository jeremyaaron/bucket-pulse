import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastVariant = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

@Injectable({ providedIn: 'root' })
export class BpToastService {
  private toasts$ = new BehaviorSubject<Toast[]>([]);
  private counter = 0;

  get stream() {
    return this.toasts$.asObservable();
  }

  show(message: string, variant: ToastVariant = 'info', durationMs = 3500) {
    const id = ++this.counter;
    const toast: Toast = { id, message, variant };
    this.toasts$.next([...this.toasts$.value, toast]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  dismiss(id: number) {
    this.toasts$.next(this.toasts$.value.filter((t) => t.id !== id));
  }
}
