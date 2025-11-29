import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'bp-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bp-table">
      <table>
        <thead *ngIf="headers?.length">
          <tr>
            <th *ngFor="let h of headers">{{ h }}</th>
          </tr>
        </thead>
        <tbody>
          <ng-content />
        </tbody>
      </table>
    </div>
  `,
  styleUrls: ['./bp-table.component.scss'],
})
export class BpTableComponent {
  @Input() headers?: string[];
}
