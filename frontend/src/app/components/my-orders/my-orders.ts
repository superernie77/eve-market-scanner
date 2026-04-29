import { Component, OnInit, ChangeDetectorRef, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarketService } from '../../services/market.service';
import { AuthService } from '../../services/auth.service';
import { MyOrder } from '../../models/market-offer.model';

@Component({
  selector: 'app-my-orders',
  standalone: true,
  imports: [
    CommonModule, MatTableModule, MatProgressSpinnerModule,
    MatIconModule, MatButtonModule, MatTooltipModule
  ],
  template: `
    <div class="header-bar">
      <div class="title-area">
        <mat-icon>assignment</mat-icon>
        <span>My Active Sell Orders</span>
        <span class="count" *ngIf="isLoggedIn && !loading">({{ orders.length }})</span>
      </div>

      <button mat-stroked-button *ngIf="isLoggedIn" (click)="load()" class="refresh-btn">
        <mat-icon>refresh</mat-icon> Refresh
      </button>
    </div>

    <!-- Not logged in -->
    <div class="empty-state" *ngIf="!isLoggedIn">
      <mat-icon>lock_outline</mat-icon>
      <p>Login with your EVE Online account to see your active sell orders.</p>
    </div>

    <!-- Logged in, loading -->
    <div class="spinner-wrap" *ngIf="isLoggedIn && loading">
      <mat-spinner diameter="48"></mat-spinner>
    </div>

    <!-- Logged in, no orders -->
    <div class="empty-state" *ngIf="isLoggedIn && !loading && orders.length === 0">
      <mat-icon>inbox</mat-icon>
      <p>No active sell orders found for this character or corporation.</p>
    </div>

    <!-- Table -->
    <div class="table-container" *ngIf="isLoggedIn && !loading && orders.length > 0">
      <table mat-table [dataSource]="orders" class="orders-table">

        <ng-container matColumnDef="source">
          <th mat-header-cell *matHeaderCellDef>Source</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'badge ' + (row.source === 'Character' ? 'char' : 'corp')">
              {{ row.source }}
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="typeName">
          <th mat-header-cell *matHeaderCellDef>Item</th>
          <td mat-cell *matCellDef="let row">
            <span class="item-name">{{ row.typeName }}</span>
            <span class="type-id">#{{ row.typeId }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="regionName">
          <th mat-header-cell *matHeaderCellDef>Region</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'region r' + row.regionId">{{ row.regionName }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="price">
          <th mat-header-cell *matHeaderCellDef>Price (ISK)</th>
          <td mat-cell *matCellDef="let row" class="num">{{ row.price | number:'1.2-2' }}</td>
        </ng-container>

        <ng-container matColumnDef="volume">
          <th mat-header-cell *matHeaderCellDef>Volume</th>
          <td mat-cell *matCellDef="let row">
            <span class="vol-remain">{{ row.volumeRemain | number }}</span>
            <span class="vol-total"> / {{ row.volumeTotal | number }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="totalValue">
          <th mat-header-cell *matHeaderCellDef>Total Value</th>
          <td mat-cell *matCellDef="let row" class="num">
            {{ row.price * row.volumeRemain | number:'1.0-0' }} ISK
          </td>
        </ng-container>

        <ng-container matColumnDef="issued">
          <th mat-header-cell *matHeaderCellDef>Issued</th>
          <td mat-cell *matCellDef="let row" [matTooltip]="row.issued | date:'medium'">
            {{ row.issued | date:'dd MMM yyyy' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="expires">
          <th mat-header-cell *matHeaderCellDef>Expires</th>
          <td mat-cell *matCellDef="let row"
              [matTooltip]="expiresOn(row) | date:'medium'"
              [class.expiring-soon]="daysLeft(row) <= 3">
            {{ daysLeft(row) }}d
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            [class.expiring-soon-row]="daysLeft(row) <= 3"></tr>
      </table>
    </div>
  `,
  styles: [`
    .header-bar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
    }
    .title-area {
      display: flex; align-items: center; gap: 10px;
      font-size: 1.05rem; font-weight: 600;
      mat-icon { color: #4dd0e1; }
    }
    .count { color: rgba(255,255,255,0.4); font-size: 0.9rem; font-weight: 400; }

    .refresh-btn { font-size: 0.8rem; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 64px 24px;
      color: rgba(255,255,255,0.3); gap: 12px;
      mat-icon { font-size: 48px; height: 48px; width: 48px; }
      p { margin: 0; font-size: 0.95rem; }
    }

    .spinner-wrap {
      display: flex; justify-content: center; padding: 48px;
    }

    .table-container { overflow-x: auto; }
    .orders-table { width: 100%; }

    .badge {
      padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;
    }
    .badge.char { background: rgba(77,208,225,0.2); color: #4dd0e1; }
    .badge.corp { background: rgba(255,215,64,0.2); color: #ffd740; }

    .item-name { font-weight: 500; }
    .type-id { color: rgba(255,255,255,0.4); font-size: 0.75rem; margin-left: 6px; }

    .region { font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; }
    .r10000002 { background: rgba(255,215,64,0.15);  color: #ffd740; }
    .r10000043 { background: rgba(239,154,154,0.15); color: #ef9a9a; }
    .r10000032 { background: rgba(144,202,249,0.15); color: #90caf9; }
    .r10000030 { background: rgba(165,214,167,0.15); color: #a5d6a7; }
    .r10000042 { background: rgba(206,147,216,0.15); color: #ce93d8; }

    .num { font-variant-numeric: tabular-nums; }
    .vol-remain { font-weight: 500; }
    .vol-total  { color: rgba(255,255,255,0.4); font-size: 0.85rem; }

    .expiring-soon { color: #ff7043; font-weight: 700; }
    .expiring-soon-row { background: rgba(255,112,67,0.06); }
  `]
})
export class MyOrdersComponent implements OnInit {
  private marketService = inject(MarketService);
  private authService   = inject(AuthService);
  private cdr           = inject(ChangeDetectorRef);

  displayedColumns = ['source', 'typeName', 'regionName', 'price', 'volume', 'totalValue', 'issued', 'expires'];

  @Output() statsChange = new EventEmitter<{ count: number; totalValue: number }>();

  orders: MyOrder[] = [];
  isLoggedIn = false;
  loading    = false;

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
    this.marketService.getMyOrders().subscribe({
      next: (data) => {
        this.orders = data;
        this.loading = false;
        const totalValue = data.reduce((sum, o) => sum + o.price * o.volumeRemain, 0);
        this.statsChange.emit({ count: data.length, totalValue });
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); }
    });
  }

  expiresOn(order: MyOrder): Date {
    const issued = new Date(order.issued);
    issued.setDate(issued.getDate() + order.duration);
    return issued;
  }

  daysLeft(order: MyOrder): number {
    const ms   = this.expiresOn(order).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  }
}
