import { Component, OnInit, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MarketService } from '../../services/market.service';
import { MarketOffer } from '../../models/market-offer.model';

@Component({
  selector: 'app-top-deals',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatListModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <mat-card class="top-deals-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>local_offer</mat-icon>
        <mat-card-title>Top 10 Best Deals</mat-card-title>
        <mat-card-subtitle>Largest discount vs average price</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div *ngIf="loading" class="spinner-wrapper">
          <mat-spinner diameter="32"></mat-spinner>
        </div>

        <mat-list *ngIf="!loading">
          <mat-list-item *ngFor="let deal of deals; let i = index" class="deal-item">
            <span matListItemTitle>
              <span class="rank">#{{ i + 1 }}</span>
              {{ deal.typeName }}
            </span>
            <span matListItemLine class="deal-meta">
              {{ deal.price | number:'1.0-0' }} ISK
              <span class="discount">-{{ deal.discountPercent | number:'1.1-1' }}%</span>
              vs avg {{ deal.averagePrice | number:'1.0-0' }}
            </span>
          </mat-list-item>

          <p *ngIf="deals.length === 0" class="empty-msg">
            No deals yet — trigger a scan first.
          </p>
        </mat-list>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .top-deals-card { height: 100%; }
    .spinner-wrapper { display: flex; justify-content: center; padding: 32px; }
    .deal-item { border-bottom: 1px solid rgba(255,255,255,0.08); }
    .rank { color: rgba(255,255,255,0.4); margin-right: 8px; min-width: 28px; display: inline-block; }
    .discount { color: #4caf50; font-weight: 700; margin: 0 6px; }
    .deal-meta { font-size: 0.8rem; color: rgba(255,255,255,0.5); }
    .empty-msg { color: rgba(255,255,255,0.4); text-align: center; padding: 24px; }
  `]
})
export class TopDealsComponent implements OnInit, OnChanges {
  private marketService = inject(MarketService);

  @Input() minAvgPriceMillion = 100;
  @Input() categoryName: string | null = null;

  deals: MarketOffer[] = [];
  loading = false;

  ngOnInit() { this.load(); }
  ngOnChanges() { this.load(); }

  load() {
    this.loading = true;
    const minPrice = this.minAvgPriceMillion > 0 ? this.minAvgPriceMillion * 1_000_000 : undefined;
    this.marketService.getTopDeals(10000002, minPrice, this.categoryName).subscribe({
      next: (d) => { this.deals = d; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}
