import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe, NgIf } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarketTableComponent } from './components/market-table/market-table';
import { ArbitrageComponent } from './components/arbitrage/arbitrage';
import { MyOrdersComponent } from './components/my-orders/my-orders';
import { WalletComponent } from './components/wallet/wallet';
import { MyBuyOrdersComponent } from './components/my-buy-orders/my-buy-orders';
import { CorpTransactionsComponent } from './components/corp-transactions/corp-transactions';
import { FavouriteArbitrageComponent } from './components/favourite-arbitrage/favourite-arbitrage';
import { CapitalContractsComponent } from './components/capital-contracts/capital-contracts';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatToolbarModule, MatIconModule, MatTabsModule, DecimalPipe, NgIf,
    MatButtonModule, MatTooltipModule,
    MarketTableComponent, ArbitrageComponent,
    MyOrdersComponent, MyBuyOrdersComponent, WalletComponent, CorpTransactionsComponent,
    FavouriteArbitrageComponent, CapitalContractsComponent
  ],
  template: `
    <mat-toolbar color="primary" class="toolbar">
      <mat-icon>rocket_launch</mat-icon>
      <span class="title">EVE Market Scanner</span>
      <span class="subtitle">| 5-Region Scanner</span>
      <span class="spacer"></span>
      <ng-container *ngIf="!isLoggedIn">
        <button mat-stroked-button class="login-btn" (click)="login()">
          <mat-icon>account_circle</mat-icon>
          Login with EVE Online
        </button>
      </ng-container>
      <ng-container *ngIf="isLoggedIn">
        <span class="char-name">
          <mat-icon>person</mat-icon>
          {{ characterName }}
        </span>
        <button mat-icon-button matTooltip="Logout" (click)="logout()">
          <mat-icon>logout</mat-icon>
        </button>
      </ng-container>
    </mat-toolbar>

    <main class="main-content">
      <div class="content-grid">
        <div class="table-panel">
          <mat-tab-group animationDuration="200ms">
            <mat-tab label="All Orders">
              <div class="tab-content">
                <app-market-table></app-market-table>
              </div>
            </mat-tab>
            <mat-tab label="Arbitrage">
              <div class="tab-content">
                <app-arbitrage></app-arbitrage>
              </div>
            </mat-tab>
            <mat-tab label="Fav Arbitrage">
              <div class="tab-content">
                <app-favourite-arbitrage></app-favourite-arbitrage>
              </div>
            </mat-tab>
            <mat-tab label="Capital Contracts">
              <div class="tab-content">
                <app-capital-contracts></app-capital-contracts>
              </div>
            </mat-tab>
            <mat-tab>
              <ng-template mat-tab-label>
                Buy Orders
                <ng-container *ngIf="myBuyOrderCount > 0">
                  <span class="tab-badge buy">{{ myBuyOrderCount }}</span>
                  <span class="tab-value">{{ myBuyOrderTotalValue | number:'1.0-0' }} ISK</span>
                </ng-container>
              </ng-template>
              <div class="tab-content">
                <app-my-buy-orders (statsChange)="onMyBuyOrdersStats($event)"></app-my-buy-orders>
              </div>
            </mat-tab>
            <mat-tab label="Corp Transactions">
              <div class="tab-content">
                <app-corp-transactions></app-corp-transactions>
              </div>
            </mat-tab>
            <mat-tab label="Wallet">
              <div class="tab-content">
                <app-wallet></app-wallet>
              </div>
            </mat-tab>
            <mat-tab>
              <ng-template mat-tab-label>
                My Orders
                <ng-container *ngIf="myOrderCount > 0">
                  <span class="tab-badge">{{ myOrderCount }}</span>
                  <span class="tab-value">{{ myOrderTotalValue | number:'1.0-0' }} ISK</span>
                </ng-container>
              </ng-template>
              <div class="tab-content">
                <app-my-orders (statsChange)="onMyOrdersStats($event)"></app-my-orders>
              </div>
            </mat-tab>
          </mat-tab-group>
        </div>
      </div>
    </main>
  `,
  styles: [`
    .toolbar { gap: 12px; }
    .title { font-size: 1.2rem; font-weight: 700; }
    .subtitle { font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-left: 4px; }
    .spacer { flex: 1; }
    .login-btn { font-size: 0.85rem; border-color: rgba(255,215,64,0.5); color: #ffd740; }
    .login-btn mat-icon { font-size: 18px; height: 18px; width: 18px; margin-right: 4px; }
    .char-name {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.9rem; color: #4dd0e1;
      mat-icon { font-size: 18px; height: 18px; width: 18px; }
    }

    .main-content {
      padding: 24px;
      max-width: 1600px;
      margin: 0 auto;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr;
    }

    .tab-content { padding-top: 16px; }

    .tab-badge {
      margin-left: 8px;
      background: rgba(77,208,225,0.2);
      color: #4dd0e1;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 10px;
      line-height: 1.6;
    }
    .tab-badge.buy {
      background: rgba(255,183,77,0.2);
      color: #ffb74d;
    }
    .tab-value {
      margin-left: 6px;
      color: rgba(255,255,255,0.45);
      font-size: 0.75rem;
      font-weight: 400;
    }

    @media (max-width: 1024px) {
      .content-grid { grid-template-columns: 1fr; }
      .side-panel { order: -1; }
    }
  `]
})
export class App implements OnInit {
  private authService = inject(AuthService);

  title = 'EVE Market Scanner';

  myOrderCount      = 0;
  myOrderTotalValue = 0;

  myBuyOrderCount      = 0;
  myBuyOrderTotalValue = 0;

  isLoggedIn    = false;
  characterName = '';

  ngOnInit() {
    this.authService.getStatus().subscribe(s => {
      this.isLoggedIn    = s.loggedIn;
      this.characterName = s.characterName ?? '';
    });
  }

  login()  { this.authService.login(); }

  logout() {
    this.authService.logout().subscribe(() => {
      this.isLoggedIn    = false;
      this.characterName = '';
    });
  }

  onMyOrdersStats(stats: { count: number; totalValue: number }) {
    this.myOrderCount      = stats.count;
    this.myOrderTotalValue = stats.totalValue;
  }

  onMyBuyOrdersStats(stats: { count: number; totalValue: number }) {
    this.myBuyOrderCount      = stats.count;
    this.myBuyOrderTotalValue = stats.totalValue;
  }
}
