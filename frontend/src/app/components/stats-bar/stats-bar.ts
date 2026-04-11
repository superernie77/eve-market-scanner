import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MarketService } from '../../services/market.service';
import { MarketStats } from '../../models/market-offer.model';

@Component({
  selector: 'app-stats-bar',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatSnackBarModule],
  template: `
    <div class="stats-bar">
      <mat-card class="stat-card">
        <mat-card-content>
          <mat-icon>list</mat-icon>
          <div class="stat-value">{{ stats?.totalOrders | number }}</div>
          <div class="stat-label">Total Orders</div>
        </mat-card-content>
      </mat-card>

      <mat-card class="stat-card highlight">
        <mat-card-content>
          <mat-icon>trending_down</mat-icon>
          <div class="stat-value">{{ stats?.goodDeals | number }}</div>
          <div class="stat-label">Good Deals</div>
        </mat-card-content>
      </mat-card>

      <mat-card class="stat-card">
        <mat-card-content>
          <mat-icon>public</mat-icon>
          <div class="stat-value">{{ regionName }}</div>
          <div class="stat-label">Region</div>
        </mat-card-content>
      </mat-card>

      <button mat-raised-button color="accent" (click)="triggerScan()" [disabled]="scanning">
        <mat-icon>refresh</mat-icon>
        {{ scanning ? 'Scanning...' : 'Scan Now' }}
      </button>
    </div>
  `,
  styles: [`
    .stats-bar {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .stat-card {
      min-width: 140px;
      text-align: center;
      mat-card-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 16px;
        gap: 4px;
      }
    }
    .stat-card.highlight { border-top: 3px solid #4caf50; }
    .stat-value { font-size: 1.8rem; font-weight: 700; }
    .stat-label { font-size: 0.75rem; color: rgba(255,255,255,0.6); }
    mat-icon { color: rgba(255,255,255,0.5); }
  `]
})
export class StatsBarComponent implements OnInit {
  private marketService = inject(MarketService);
  private snackBar = inject(MatSnackBar);

  stats: MarketStats | null = null;
  scanning = false;
  regionName = 'The Forge (Jita)';

  ngOnInit() {
    this.loadStats();
  }

  loadStats() {
    this.marketService.getStats().subscribe(s => this.stats = s);
  }

  triggerScan() {
    this.scanning = true;
    this.marketService.triggerScan().subscribe({
      next: () => {
        this.snackBar.open('Scan triggered — results will appear in ~30s', 'OK', { duration: 4000 });
        setTimeout(() => { this.scanning = false; this.loadStats(); }, 35000);
      },
      error: () => { this.scanning = false; }
    });
  }
}
