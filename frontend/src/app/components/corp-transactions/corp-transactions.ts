import { Component, OnInit, AfterViewInit, ViewChild, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MarketService } from '../../services/market.service';
import { AuthService } from '../../services/auth.service';
import { CorpTransaction } from '../../models/market-offer.model';

@Component({
  selector: 'app-corp-transactions',
  standalone: true,
  imports: [
    CommonModule, MatTableModule, MatSortModule, MatProgressSpinnerModule,
    MatIconModule, MatButtonModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule
  ],
  template: `
    <div class="header-bar">
      <div class="title-area">
        <mat-icon>receipt_long</mat-icon>
        <span>Corp Market Transactions</span>
        <span class="count" *ngIf="isLoggedIn && !loading">({{ dataSource.data.length }})</span>
      </div>

      <div class="controls">
        <mat-form-field appearance="outline" class="search-field" *ngIf="isLoggedIn && !loading && dataSource.data.length > 0">
          <mat-label>Filter items</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput (input)="applyFilter($event)" placeholder="e.g. PLEX">
        </mat-form-field>

        <button mat-stroked-button *ngIf="isLoggedIn" (click)="load()" class="refresh-btn">
          <mat-icon>refresh</mat-icon> Refresh
        </button>
      </div>
    </div>

    <!-- Not logged in -->
    <div class="empty-state" *ngIf="!isLoggedIn">
      <mat-icon>lock_outline</mat-icon>
      <p>Login with your EVE Online account to see corporation transactions.</p>
    </div>

    <!-- Missing scope warning -->
    <div class="scope-warning" *ngIf="isLoggedIn && !hasCorpWalletScope && !loading">
      <mat-icon>warning_amber</mat-icon>
      <div>
        <strong>Corp wallet access not granted.</strong>
        <p>Your login session is missing <code>esi-wallet.read_corporation_wallets.v1</code>.
        Add this scope to your EVE developer app, then <strong>log out and log back in</strong>.</p>
      </div>
    </div>

    <!-- Loading -->
    <div class="spinner-wrap" *ngIf="isLoggedIn && loading">
      <mat-spinner diameter="48"></mat-spinner>
    </div>

    <!-- No data -->
    <div class="empty-state" *ngIf="isLoggedIn && !loading && dataSource.data.length === 0">
      <mat-icon>receipt</mat-icon>
      <p>No transactions found. The character may lack wallet access or the corp has no recent transactions.</p>
    </div>

    <!-- Summary bar -->
    <div class="summary-bar" *ngIf="isLoggedIn && !loading && dataSource.data.length > 0">
      <div class="summary-item">
        <span class="summary-label">Transactions</span>
        <span class="summary-value">{{ dataSource.data.length }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Total Sold</span>
        <span class="summary-value sell">{{ totalSold() | number:'1.0-0' }} ISK</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Total Bought</span>
        <span class="summary-value buy">{{ totalBought() | number:'1.0-0' }} ISK</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Net</span>
        <span class="summary-value" [class.net-pos]="netIsk() >= 0" [class.net-neg]="netIsk() < 0">
          {{ netIsk() | number:'1.0-0' }} ISK
        </span>
      </div>
    </div>

    <!-- Table -->
    <div class="table-container" *ngIf="isLoggedIn && !loading && dataSource.data.length > 0">
      <table mat-table [dataSource]="dataSource" matSort class="tx-table">

        <ng-container matColumnDef="date">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="date">Date</th>
          <td mat-cell *matCellDef="let row" [matTooltip]="row.date | date:'medium'">
            {{ row.date | date:'dd MMM yyyy HH:mm' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="type">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="isBuy">Type</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="row.isBuy ? 'badge buy' : 'badge sell'">
              {{ row.isBuy ? 'Buy' : 'Sell' }}
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="typeName">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="typeName">Item</th>
          <td mat-cell *matCellDef="let row">
            <span class="item-name">{{ row.typeName }}</span>
            <span class="type-id">#{{ row.typeId }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="quantity">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="quantity">Qty</th>
          <td mat-cell *matCellDef="let row" class="num">{{ row.quantity | number }}</td>
        </ng-container>

        <ng-container matColumnDef="unitPrice">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="unitPrice">Unit Price (ISK)</th>
          <td mat-cell *matCellDef="let row" class="num">{{ row.unitPrice | number:'1.2-2' }}</td>
        </ng-container>

        <ng-container matColumnDef="totalValue">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="totalValue">Total Value (ISK)</th>
          <td mat-cell *matCellDef="let row" class="num"
              [class.sell-val]="!row.isBuy" [class.buy-val]="row.isBuy">
            {{ row.totalValue | number:'1.0-0' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="locationName">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="locationName">Location</th>
          <td mat-cell *matCellDef="let row" class="location">{{ row.locationName }}</td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            [class.row-sell]="!row.isBuy" [class.row-buy]="row.isBuy"></tr>

        <tr class="mat-row" *matNoDataRow>
          <td class="mat-cell no-data" [attr.colspan]="displayedColumns.length">
            No transactions match the filter.
          </td>
        </tr>
      </table>
    </div>
  `,
  styles: [`
    .header-bar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px; flex-wrap: wrap; gap: 12px;
    }
    .title-area {
      display: flex; align-items: center; gap: 10px;
      font-size: 1.05rem; font-weight: 600;
      mat-icon { color: #ffd740; }
    }
    .count { color: rgba(255,255,255,0.4); font-size: 0.9rem; font-weight: 400; }
    .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .search-field { min-width: 200px; }

    .refresh-btn { font-size: 0.8rem; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 64px 24px;
      color: rgba(255,255,255,0.3); gap: 12px;
      mat-icon { font-size: 48px; height: 48px; width: 48px; }
      p { margin: 0; font-size: 0.95rem; text-align: center; }
    }
    .spinner-wrap { display: flex; justify-content: center; padding: 48px; }

    .summary-bar {
      display: flex; gap: 32px; flex-wrap: wrap;
      padding: 12px 16px; margin-bottom: 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
    }
    .summary-item { display: flex; flex-direction: column; gap: 2px; }
    .summary-label { font-size: 0.72rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.06em; }
    .summary-value { font-size: 1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .summary-value.sell { color: #69f0ae; }
    .summary-value.buy  { color: #ff7043; }
    .net-pos { color: #69f0ae; }
    .net-neg { color: #ff7043; }

    .table-container { overflow-x: auto; }
    .tx-table { width: 100%; }

    .badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .badge.sell { background: rgba(105,240,174,0.15); color: #69f0ae; }
    .badge.buy  { background: rgba(255,112,67,0.15);  color: #ff7043; }

    .item-name { font-weight: 500; }
    .type-id { color: rgba(255,255,255,0.4); font-size: 0.75rem; margin-left: 6px; }
    .num { font-variant-numeric: tabular-nums; }
    .sell-val { color: #69f0ae; font-weight: 600; }
    .buy-val  { color: #ff7043; font-weight: 600; }

    .row-sell { background: rgba(105,240,174,0.02); }
    .row-buy  { background: rgba(255,112,67,0.02); }

    .location { color: rgba(255,255,255,0.6); font-size: 0.85rem; }
    .no-data { text-align: center; padding: 32px; color: rgba(255,255,255,0.4); }

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
export class CorpTransactionsComponent implements OnInit, AfterViewInit {
  private marketService = inject(MarketService);
  private authService   = inject(AuthService);
  private cdr           = inject(ChangeDetectorRef);

  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns = ['date', 'type', 'typeName', 'quantity', 'unitPrice', 'totalValue', 'locationName'];

  dataSource         = new MatTableDataSource<CorpTransaction>([]);
  isLoggedIn         = false;
  hasCorpWalletScope = false;
  loading            = false;

  ngOnInit() {
    this.authService.status$.subscribe(s => {
      const wasLoggedIn = this.isLoggedIn;
      this.isLoggedIn         = s.loggedIn;
      this.hasCorpWalletScope = s.hasCorpWalletScope ?? false;
      this.cdr.markForCheck();
      if (s.loggedIn && !wasLoggedIn) this.load();
    });
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.filterPredicate = (row, filter) =>
      row.typeName.toLowerCase().includes(filter);
    this.dataSource.sortingDataAccessor = (row, id) => (row as any)[id] ?? '';
  }

  load() {
    this.loading = true;
    this.marketService.getCorpTransactions().subscribe({
      next: (data) => { this.dataSource.data = data; this.loading = false; this.cdr.markForCheck(); },
      error: ()     => { this.loading = false; this.cdr.markForCheck(); }
    });
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim().toLowerCase();
  }

  totalSold():   number { return this.dataSource.data.filter(t => !t.isBuy).reduce((s, t) => s + t.totalValue, 0); }
  totalBought(): number { return this.dataSource.data.filter(t =>  t.isBuy).reduce((s, t) => s + t.totalValue, 0); }
  netIsk():      number { return this.totalSold() - this.totalBought(); }
}
