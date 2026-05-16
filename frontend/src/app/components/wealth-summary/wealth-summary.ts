import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MarketService } from '../../services/market.service';
import { AuthService } from '../../services/auth.service';
import { WalletData, MyOrder, MyContract } from '../../models/market-offer.model';

@Component({
  selector: 'app-wealth-summary',
  standalone: true,
  imports: [
    CommonModule, DecimalPipe,
    MatIconModule, MatButtonModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  template: `
    <div class="wealth-card" *ngIf="isLoggedIn">
      <div class="wealth-header">
        <div class="wealth-title">
          <mat-icon>account_balance</mat-icon>
          <span>Wealth Summary</span>
        </div>
        <button mat-icon-button matTooltip="Refresh" (click)="load()" [disabled]="loading">
          <mat-icon>refresh</mat-icon>
        </button>
      </div>

      <div class="spinner-row" *ngIf="loading">
        <mat-spinner diameter="28"></mat-spinner>
      </div>

      <div class="stats-row" *ngIf="!loading">

        <div class="stat-tile">
          <mat-icon class="tile-icon" style="color:#4dd0e1">account_balance_wallet</mat-icon>
          <span class="tile-label">Wallet</span>
          <span class="tile-value">{{ fmt(walletTotal) }}</span>
          <span class="tile-unit">M ISK</span>
          <span class="tile-sub" *ngIf="walletNote">{{ walletNote }}</span>
        </div>

        <div class="vdiv"></div>

        <div class="stat-tile">
          <mat-icon class="tile-icon" style="color:#ce93d8">description</mat-icon>
          <span class="tile-label">Outstanding Contracts</span>
          <span class="tile-value">{{ fmt(contractsTotal) }}</span>
          <span class="tile-unit">M ISK</span>
          <span class="tile-sub" *ngIf="contractCount > 0">{{ contractCount }} contract{{ contractCount === 1 ? '' : 's' }}</span>
        </div>

        <div class="vdiv"></div>

        <div class="stat-tile">
          <mat-icon class="tile-icon" style="color:#81c784">sell</mat-icon>
          <span class="tile-label">Sell Orders</span>
          <span class="tile-value">{{ fmt(sellTotal) }}</span>
          <span class="tile-unit">M ISK</span>
          <span class="tile-sub" *ngIf="sellCount > 0">{{ sellCount }} order{{ sellCount === 1 ? '' : 's' }}</span>
        </div>

        <div class="vdiv"></div>

        <div class="stat-tile">
          <mat-icon class="tile-icon" style="color:#ffb74d">shopping_cart</mat-icon>
          <span class="tile-label">Buy Orders</span>
          <span class="tile-value">{{ fmt(buyTotal) }}</span>
          <span class="tile-unit">M ISK</span>
          <span class="tile-sub" *ngIf="buyCount > 0">{{ buyCount }} order{{ buyCount === 1 ? '' : 's' }}</span>
        </div>

        <div class="vdiv grand-vdiv"></div>

        <div class="stat-tile grand-tile">
          <mat-icon class="tile-icon" style="color:#ffd740">stars</mat-icon>
          <span class="tile-label">Grand Total</span>
          <span class="tile-value grand-value">{{ fmt(grandTotal) }}</span>
          <span class="tile-unit">M ISK</span>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .wealth-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px 24px;
      margin-bottom: 20px;
    }

    .wealth-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .wealth-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.9rem; font-weight: 600; color: rgba(255,255,255,0.7);
      mat-icon { font-size: 18px; height: 18px; width: 18px; color: rgba(255,255,255,0.4); }
    }

    .spinner-row { display: flex; align-items: center; padding: 8px 0; }

    .stats-row {
      display: flex; align-items: stretch; gap: 0; flex-wrap: wrap;
    }

    .vdiv {
      width: 1px; background: rgba(255,255,255,0.08); margin: 0 20px;
      flex-shrink: 0;
    }
    .grand-vdiv {
      background: rgba(255,215,64,0.2); margin: 0 24px;
    }

    .stat-tile {
      display: flex; flex-direction: column; gap: 3px;
      min-width: 130px; flex: 1;
    }

    .tile-icon {
      font-size: 18px; height: 18px; width: 18px; margin-bottom: 2px;
    }
    .tile-label {
      font-size: 0.72rem; color: rgba(255,255,255,0.4);
      text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
      white-space: nowrap;
    }
    .tile-value {
      font-size: 1.15rem; font-weight: 700; color: rgba(255,255,255,0.9);
      font-variant-numeric: tabular-nums; line-height: 1.2;
    }
    .tile-unit {
      font-size: 0.7rem; color: rgba(255,255,255,0.35); font-weight: 500;
    }
    .tile-sub {
      font-size: 0.72rem; color: rgba(255,255,255,0.3); margin-top: 1px;
    }

    .grand-tile .tile-label { color: rgba(255,215,64,0.6); }
    .grand-tile .tile-unit  { color: rgba(255,215,64,0.4); }
    .grand-value { color: #ffd740 !important; font-size: 1.25rem !important; }
  `],
})
export class WealthSummaryComponent implements OnInit {
  private marketService = inject(MarketService);
  private authService   = inject(AuthService);
  private cdr           = inject(ChangeDetectorRef);

  isLoggedIn = false;
  loading    = false;

  walletTotal    = 0;
  walletNote     = '';
  contractsTotal = 0;
  contractCount  = 0;
  sellTotal      = 0;
  sellCount      = 0;
  buyTotal       = 0;
  buyCount       = 0;

  get grandTotal() {
    return this.walletTotal + this.contractsTotal + this.sellTotal + this.buyTotal;
  }

  ngOnInit() {
    this.authService.status$.subscribe(s => {
      const wasLoggedIn = this.isLoggedIn;
      this.isLoggedIn = s.loggedIn;
      this.cdr.markForCheck();
      if (s.loggedIn && !wasLoggedIn) this.load();
    });
  }

  load() {
    this.loading = true;
    this.cdr.markForCheck();

    forkJoin({
      wallet:    this.marketService.getWallet().pipe(catchError(() => of(null))),
      contracts: this.marketService.getMyContracts().pipe(catchError(() => of([] as MyContract[]))),
      sell:      this.marketService.getMyOrders().pipe(catchError(() => of([] as MyOrder[]))),
      buy:       this.marketService.getMyBuyOrders().pipe(catchError(() => of([] as MyOrder[]))),
    }).subscribe(({ wallet, contracts, sell, buy }) => {
      this.applyWallet(wallet);
      this.applyContracts(contracts ?? []);
      this.applySell(sell ?? []);
      this.applyBuy(buy ?? []);
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  private applyWallet(wallet: WalletData | null) {
    if (!wallet) { this.walletTotal = 0; this.walletNote = 'unavailable'; return; }
    const charBal  = wallet.characterBalance ?? 0;
    const corpBal  = (wallet.corpDivisions ?? []).reduce((s, d) => s + (d.balance ?? 0), 0);
    this.walletTotal = charBal + corpBal;
    const parts: string[] = [];
    if (charBal > 0)  parts.push(`char ${this.fmt(charBal)} M`);
    if (corpBal > 0)  parts.push(`corp ${this.fmt(corpBal)} M`);
    this.walletNote = parts.join(' + ');
  }

  private applyContracts(contracts: MyContract[]) {
    const outstanding = contracts.filter(c => c.status === 'outstanding' || c.status === 'in_progress');
    this.contractCount  = outstanding.length;
    this.contractsTotal = outstanding.reduce((s, c) => s + (c.price ?? 0), 0);
  }

  private applySell(orders: MyOrder[]) {
    this.sellCount = orders.length;
    this.sellTotal = orders.reduce((s, o) => s + o.price * o.volumeRemain, 0);
  }

  private applyBuy(orders: MyOrder[]) {
    this.buyCount = orders.length;
    this.buyTotal = orders.reduce((s, o) => s + o.price * o.volumeRemain, 0);
  }

  fmt(isk: number): string {
    return (isk / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
