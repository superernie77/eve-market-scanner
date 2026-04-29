import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MarketService } from '../../services/market.service';
import { AuthService } from '../../services/auth.service';
import { WalletData, CorpDivision } from '../../models/market-offer.model';

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [
    CommonModule, DecimalPipe,
    MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatTooltipModule, MatTableModule
  ],
  template: `
    <div class="header-bar">
      <div class="title-area">
        <mat-icon>account_balance_wallet</mat-icon>
        <span>Wallet Balances</span>
      </div>

      <button mat-stroked-button *ngIf="isLoggedIn" (click)="load()" class="refresh-btn">
        <mat-icon>refresh</mat-icon> Refresh
      </button>
    </div>

    <!-- Not logged in -->
    <div class="empty-state" *ngIf="!isLoggedIn">
      <mat-icon>lock_outline</mat-icon>
      <p>Login with your EVE Online account to see wallet balances.</p>
    </div>

    <!-- Logged in but wallet scope missing -->
    <div class="scope-warning" *ngIf="isLoggedIn && !hasWalletScope && !loading">
      <mat-icon>warning_amber</mat-icon>
      <div>
        <strong>Wallet access not granted.</strong>
        <p>Your current login session is missing the <code>esi-wallet.*</code> scopes.
        Make sure these scopes are added to your EVE developer app, then
        <strong>log out and log back in</strong> to get a token with wallet access.</p>
      </div>
    </div>

    <!-- Loading -->
    <div class="spinner-wrap" *ngIf="isLoggedIn && loading">
      <mat-spinner diameter="48"></mat-spinner>
    </div>

    <!-- Wallet data -->
    <div class="wallet-content" *ngIf="isLoggedIn && !loading && wallet">

      <!-- Character wallet -->
      <div class="wallet-card char-card">
        <div class="card-label">
          <mat-icon>person</mat-icon>
          Character Wallet
        </div>
        <div class="balance" [class.positive]="(wallet.characterBalance ?? 0) > 0">
          {{ wallet.characterBalance | number:'1.2-2' }}
          <span class="isk">ISK</span>
        </div>
      </div>

      <!-- Corp wallet -->
      <div class="wallet-card corp-card" *ngIf="wallet.corpDivisions && wallet.corpDivisions.length > 0">
        <div class="card-label">
          <mat-icon>corporate_fare</mat-icon>
          Corporation Wallets
          <span class="corp-total">Total: {{ corpTotal() | number:'1.2-2' }} ISK</span>
        </div>
        <table mat-table [dataSource]="wallet.corpDivisions" class="corp-table">
          <ng-container matColumnDef="division">
            <th mat-header-cell *matHeaderCellDef>Division</th>
            <td mat-cell *matCellDef="let row">
              <span class="div-badge">{{ divisionLabel(row.division) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="balance">
            <th mat-header-cell *matHeaderCellDef>Balance (ISK)</th>
            <td mat-cell *matCellDef="let row" class="num"
                [class.positive]="row.balance > 0"
                [class.zero]="row.balance === 0">
              {{ row.balance | number:'1.2-2' }}
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="['division','balance']"></tr>
          <tr mat-row *matRowDef="let row; columns: ['division','balance'];"></tr>
        </table>
      </div>

      <!-- Corp wallet not accessible -->
      <div class="wallet-card corp-card no-access"
           *ngIf="wallet.corpDivisions && wallet.corpDivisions.length === 0">
        <div class="card-label">
          <mat-icon>corporate_fare</mat-icon>
          Corporation Wallets
        </div>
        <p class="no-access-msg">
          <mat-icon>info_outline</mat-icon>
          Not accessible — character needs the Accountant or Junior Accountant role.
        </p>
      </div>

    </div>
  `,
  styles: [`
    .header-bar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
    .title-area {
      display: flex; align-items: center; gap: 10px;
      font-size: 1.05rem; font-weight: 600;
      mat-icon { color: #4dd0e1; }
    }
    .refresh-btn { font-size: 0.8rem; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 64px 24px;
      color: rgba(255,255,255,0.3); gap: 12px;
      mat-icon { font-size: 48px; height: 48px; width: 48px; }
      p { margin: 0; font-size: 0.95rem; }
    }
    .spinner-wrap { display: flex; justify-content: center; padding: 48px; }

    .wallet-content {
      display: flex; flex-direction: column; gap: 24px;
    }

    .wallet-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 24px 28px;
    }

    .card-label {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.5);
      text-transform: uppercase; letter-spacing: 0.08em;
      margin-bottom: 16px;
      mat-icon { font-size: 18px; height: 18px; width: 18px; }
    }

    .corp-total {
      margin-left: auto;
      font-size: 0.8rem; color: rgba(255,215,64,0.7);
      text-transform: none; letter-spacing: normal; font-weight: 500;
    }

    .char-card .card-label mat-icon { color: #4dd0e1; }
    .corp-card .card-label mat-icon { color: #ffd740; }

    .balance {
      font-size: 2.4rem; font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: rgba(255,255,255,0.6);
      line-height: 1.1;
    }
    .balance.positive { color: #69f0ae; }
    .balance .isk {
      font-size: 1rem; font-weight: 400;
      color: rgba(255,255,255,0.35);
      margin-left: 8px;
    }

    .corp-table { width: 100%; background: transparent; }
    .num { font-variant-numeric: tabular-nums; text-align: right; }
    .positive { color: #69f0ae; }
    .zero { color: rgba(255,255,255,0.25); }

    .div-badge {
      background: rgba(255,215,64,0.12);
      color: #ffd740;
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .no-access { opacity: 0.6; }
    .no-access-msg {
      display: flex; align-items: center; gap: 8px;
      color: rgba(255,255,255,0.4); font-size: 0.9rem; margin: 0;
      mat-icon { font-size: 18px; height: 18px; width: 18px; }
    }

    .scope-warning {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 16px 20px; border-radius: 8px; margin-bottom: 16px;
      background: rgba(255,167,38,0.1); border: 1px solid rgba(255,167,38,0.3);
      color: rgba(255,255,255,0.8);
      mat-icon { color: #ffa726; margin-top: 2px; flex-shrink: 0; }
      strong { color: #ffa726; }
      p { margin: 6px 0 0; font-size: 0.88rem; color: rgba(255,255,255,0.6); }
      code { background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 3px; font-size: 0.82rem; }
    }
  `]
})
export class WalletComponent implements OnInit {
  private marketService = inject(MarketService);
  private authService   = inject(AuthService);
  private cdr           = inject(ChangeDetectorRef);

  wallet:          WalletData | null = null;
  isLoggedIn       = false;
  hasWalletScope   = false;
  loading          = false;

  ngOnInit() {
    this.authService.status$.subscribe(s => {
      const wasLoggedIn = this.isLoggedIn;
      this.isLoggedIn     = s.loggedIn;
      this.hasWalletScope = s.hasWalletScope ?? false;
      this.cdr.markForCheck();
      if (s.loggedIn && !wasLoggedIn) this.load();
    });
  }

  load() {
    this.loading = true;
    this.marketService.getWallet().subscribe({
      next: (data) => { this.wallet = data; this.loading = false; this.cdr.markForCheck(); },
      error: ()     => { this.loading = false; }
    });
  }

  corpTotal(): number {
    if (!this.wallet?.corpDivisions) return 0;
    return this.wallet.corpDivisions.reduce((sum, d) => sum + (d.balance ?? 0), 0);
  }

  divisionLabel(division: number): string {
    return division === 1 ? 'Master Wallet' : `Division ${division}`;
  }
}
