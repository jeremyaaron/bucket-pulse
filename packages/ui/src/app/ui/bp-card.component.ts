import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BpPillComponent, BpPillVariant } from './bp-pill.component';

@Component({
  selector: 'bp-card',
  standalone: true,
  imports: [CommonModule, BpPillComponent],
  template: `
    <section class="bp-card" [class.bp-card--dense]="dense">
      <header class="bp-card__header" *ngIf="title || subtitle || statusVariant">
        <div class="bp-card__header-main">
          <div class="bp-card__titles">
            <h3 class="bp-card__title" *ngIf="title">{{ title }}</h3>
            <p class="bp-card__subtitle" *ngIf="subtitle">{{ subtitle }}</p>
          </div>
          <div class="bp-card__status" *ngIf="statusVariant">
            <bp-pill [variant]="statusVariant || 'neutral'">
              <ng-content select="[cardStatusLabel]" />
            </bp-pill>
          </div>
        </div>
        <div class="bp-card__header-actions">
          <ng-content select="[cardActions]" />
        </div>
      </header>

      <div class="bp-card__body">
        <ng-content />
      </div>

      <footer class="bp-card__footer">
        <ng-content select="[cardFooter]" />
      </footer>
    </section>
  `,
  styleUrls: ['./bp-card.component.scss'],
})
export class BpCardComponent {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() statusVariant?: BpPillVariant;
  @Input() dense = false;
  @Input() showHeaderDivider = true;
}
