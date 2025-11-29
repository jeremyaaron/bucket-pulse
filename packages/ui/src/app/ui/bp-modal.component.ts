import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'bp-modal',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="bp-modal__backdrop" *ngIf="open" (click)="onBackdrop()" aria-hidden="true"></div>
    <div
      class="bp-modal"
      *ngIf="open"
      role="dialog"
      aria-modal="true"
      #modalContainer
      (keydown)="onKeydown($event)"
    >
      <div class="bp-modal__header">
        <div>
          <p class="bp-modal__eyebrow" *ngIf="eyebrow">{{ eyebrow }}</p>
          <h3 class="bp-modal__title">{{ title }}</h3>
          <p class="bp-modal__subtitle" *ngIf="subtitle">{{ subtitle }}</p>
        </div>
        <button class="bp-modal__close" type="button" (click)="close.emit()">×</button>
      </div>
      <div class="bp-modal__body">
        <ng-content />
      </div>
      <div class="bp-modal__footer">
        <ng-content select="[modalFooter]" />
      </div>
    </div>
  `,
  styleUrls: ['./bp-modal.component.scss'],
})
export class BpModalComponent implements AfterViewInit, OnChanges {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle?: string;
  @Input() eyebrow?: string;
  @Output() close = new EventEmitter<void>();
  @ViewChild('modalContainer') modalRef?: ElementRef<HTMLElement>;
  private focusable: HTMLElement[] = [];
  private focusInitialized = false;

  onBackdrop() {
    this.close.emit();
  }

  ngAfterViewInit() {
    this.tryInitFocus();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] && this.open) {
      this.focusInitialized = false;
      setTimeout(() => this.tryInitFocus(), 0);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent) {
    if (!this.open) return;
    ev.preventDefault();
    this.close.emit();
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.open || event.key !== 'Tab') return;
    if (!this.focusable.length) {
      this.tryInitFocus();
      if (!this.focusable.length) return;
    }

    const first = this.focusable[0];
    const last = this.focusable[this.focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (active === first || !active) {
        last.focus();
        event.preventDefault();
      }
    } else {
      if (active === last) {
        first.focus();
        event.preventDefault();
      }
    }
  }

  private tryInitFocus() {
    if (!this.modalRef?.nativeElement || this.focusInitialized || !this.open) return;
    const container = this.modalRef.nativeElement;
    this.focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'));
    const target = this.focusable[0] || container;
    target.focus();
    this.focusInitialized = true;
  }
}
