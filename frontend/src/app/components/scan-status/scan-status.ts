import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ScanStatusService, RegionStatus, ScanGroupStatus } from '../../services/scan-status.service';

@Component({
  selector: 'app-scan-status',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="status-bar" *ngIf="statusService.status$ | async as s">

      <div class="group">
        <span class="group-label">
          <mat-icon class="label-icon">storefront</mat-icon>
          Market
        </span>
        <div class="chips">
          <div *ngFor="let r of s.market.regions"
               class="chip"
               [class.active]="r.active"
               [class.fresh]="!r.active && r.fresh"
               [class.stale]="!r.active && !r.fresh"
               [matTooltip]="tooltip(r)">
            <mat-icon class="chip-icon spin" *ngIf="r.active">sync</mat-icon>
            <mat-icon class="chip-icon" *ngIf="!r.active && r.fresh">check_circle</mat-icon>
            <mat-icon class="chip-icon" *ngIf="!r.active && !r.fresh">warning</mat-icon>
            <span class="chip-name">{{ r.regionName }}</span>
          </div>
          <div class="all-fresh" *ngIf="allFresh(s.market) && !s.market.scanning">
            <mat-icon>done_all</mat-icon> Up to date
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="group">
        <span class="group-label">
          <mat-icon class="label-icon">inventory_2</mat-icon>
          Contracts
        </span>
        <div class="chips">
          <div *ngFor="let r of s.contracts.regions"
               class="chip"
               [class.active]="r.active"
               [class.fresh]="!r.active && r.fresh"
               [class.stale]="!r.active && !r.fresh"
               [matTooltip]="tooltip(r)">
            <mat-icon class="chip-icon spin" *ngIf="r.active">sync</mat-icon>
            <mat-icon class="chip-icon" *ngIf="!r.active && r.fresh">check_circle</mat-icon>
            <mat-icon class="chip-icon" *ngIf="!r.active && !r.fresh">warning</mat-icon>
            <span class="chip-name">{{ r.regionName }}</span>
          </div>
          <div class="all-fresh" *ngIf="allFresh(s.contracts) && !s.contracts.scanning">
            <mat-icon>done_all</mat-icon> Up to date
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .status-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 6px 24px;
      background: rgba(0,0,0,0.25);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-wrap: wrap;
      font-size: 0.78rem;
    }

    .group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .group-label {
      display: flex;
      align-items: center;
      gap: 4px;
      color: rgba(255,255,255,0.4);
      font-weight: 600;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    .label-icon { font-size: 14px; width: 14px; height: 14px; }

    .divider {
      width: 1px;
      height: 24px;
      background: rgba(255,255,255,0.1);
    }

    .chips {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      border: 1px solid transparent;
      cursor: default;
    }

    .chip.active {
      background: rgba(77,208,225,0.12);
      border-color: rgba(77,208,225,0.3);
      color: #4dd0e1;
    }
    .chip.fresh {
      background: rgba(105,240,174,0.08);
      border-color: rgba(105,240,174,0.2);
      color: #69f0ae;
    }
    .chip.stale {
      background: rgba(255,152,0,0.08);
      border-color: rgba(255,152,0,0.2);
      color: #ffb74d;
    }

    .chip-icon {
      font-size: 13px;
      width: 13px;
      height: 13px;
    }

    .all-fresh {
      display: flex;
      align-items: center;
      gap: 4px;
      color: rgba(105,240,174,0.5);
      font-size: 0.72rem;
      mat-icon { font-size: 13px; width: 13px; height: 13px; }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spin { animation: spin 1.2s linear infinite; }
  `]
})
export class ScanStatusComponent {
  statusService = inject(ScanStatusService);

  allFresh(group: ScanGroupStatus): boolean {
    return group.regions.length > 0 && group.regions.every(r => r.fresh);
  }

  tooltip(r: RegionStatus): string {
    if (r.active) return `${r.regionName}: scanning now…`;
    if (!r.lastScanAt) return `${r.regionName}: not yet scanned since last restart`;
    const ago = this.timeAgo(new Date(r.lastScanAt));
    return `${r.regionName}: last scanned ${ago}`;
  }

  private timeAgo(date: Date): string {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }
}
