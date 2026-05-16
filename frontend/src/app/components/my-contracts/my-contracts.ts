import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MarketService } from '../../services/market.service';
import { AuthService } from '../../services/auth.service';
import { MyContract, MyContractItem } from '../../models/market-offer.model';

@Component({
  selector: 'app-my-contracts',
  standalone: true,
  imports: [
    CommonModule, MatTableModule, MatProgressSpinnerModule,
    MatIconModule, MatButtonModule, MatTooltipModule,
    DatePipe, DecimalPipe,
  ],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded',  style({ height: '*' })),
      transition('expanded <=> collapsed', animate('200ms cubic-bezier(0.4, 0, 0.2, 1)')),
    ]),
  ],
  template: `
    <div class="header-bar">
      <div class="title-area">
        <mat-icon>description</mat-icon>
        <span>My Contracts</span>
        <span class="count" *ngIf="isLoggedIn && !loading">({{ filtered.length }})</span>
        <span class="outstanding-total" *ngIf="isLoggedIn && !loading && outstandingTotal > 0">
          Outstanding: {{ outstandingTotal / 1e6 | number:'1.2-2' }} M ISK
        </span>
      </div>
      <div class="controls" *ngIf="isLoggedIn && !loading && contracts.length > 0">
        <div class="filter-group">
          <button mat-stroked-button
                  *ngFor="let f of statusFilters"
                  [class.active]="statusFilter === f.value"
                  (click)="setFilter(f.value)"
                  class="filter-btn">
            {{ f.label }}
          </button>
        </div>
        <button mat-stroked-button (click)="load()" class="refresh-btn">
          <mat-icon>refresh</mat-icon> Refresh
        </button>
      </div>
      <button mat-stroked-button *ngIf="isLoggedIn && (loading || contracts.length === 0)" (click)="load()" class="refresh-btn">
        <mat-icon>refresh</mat-icon> Refresh
      </button>
    </div>

    <!-- Not logged in -->
    <div class="empty-state" *ngIf="!isLoggedIn">
      <mat-icon>lock_outline</mat-icon>
      <p>Login with your EVE Online account to see your contracts.</p>
    </div>

    <!-- Missing scope -->
    <div class="empty-state warn" *ngIf="isLoggedIn && !hasContractScope && !loading">
      <mat-icon>warning_amber</mat-icon>
      <p>Contract scope not granted. Logout and re-login to authorize the new scope.</p>
    </div>

    <!-- Loading -->
    <div class="spinner-wrap" *ngIf="isLoggedIn && hasContractScope && loading">
      <mat-spinner diameter="48"></mat-spinner>
    </div>

    <!-- Empty -->
    <div class="empty-state" *ngIf="isLoggedIn && hasContractScope && !loading && filtered.length === 0">
      <mat-icon>inbox</mat-icon>
      <p>No contracts found.</p>
    </div>

    <!-- Table -->
    <div class="table-container" *ngIf="isLoggedIn && hasContractScope && !loading && filtered.length > 0">
      <table mat-table [dataSource]="filtered" multiTemplateDataRows class="contracts-table">

        <!-- Expand toggle -->
        <ng-container matColumnDef="expand">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let row">
            <mat-icon class="expand-icon" [class.expanded]="expandedRow === row">
              chevron_right
            </mat-icon>
          </td>
        </ng-container>

        <ng-container matColumnDef="source">
          <th mat-header-cell *matHeaderCellDef>Source</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'badge ' + (row.source === 'Character' ? 'char' : 'corp')">
              {{ row.source }}
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="type">
          <th mat-header-cell *matHeaderCellDef>Type</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'type-badge ' + row.type">{{ typeLabel(row.type) }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Status</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'status-badge ' + row.status">{{ statusLabel(row.status) }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="title">
          <th mat-header-cell *matHeaderCellDef>Title / Location</th>
          <td mat-cell *matCellDef="let row">
            <div class="title-cell">
              <span class="contract-title" *ngIf="row.title">{{ row.title }}</span>
              <span class="location">{{ row.startLocationName }}</span>
              <span class="location end" *ngIf="row.endLocationName"> → {{ row.endLocationName }}</span>
            </div>
          </td>
        </ng-container>

        <ng-container matColumnDef="price">
          <th mat-header-cell *matHeaderCellDef>Price / Reward</th>
          <td mat-cell *matCellDef="let row" class="num">
            <ng-container *ngIf="row.price && row.price > 0">
              {{ row.price / 1e6 | number:'1.2-2' }} M
            </ng-container>
            <ng-container *ngIf="row.reward && row.reward > 0">
              <span class="reward">+{{ row.reward / 1e6 | number:'1.2-2' }} M</span>
            </ng-container>
            <ng-container *ngIf="(!row.price || row.price === 0) && (!row.reward || row.reward === 0)">
              —
            </ng-container>
          </td>
        </ng-container>

        <ng-container matColumnDef="issued">
          <th mat-header-cell *matHeaderCellDef>Issued</th>
          <td mat-cell *matCellDef="let row" [matTooltip]="row.dateIssued | date:'medium'">
            {{ row.dateIssued | date:'dd MMM yyyy' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="expires">
          <th mat-header-cell *matHeaderCellDef>Expires</th>
          <td mat-cell *matCellDef="let row"
              [matTooltip]="row.dateExpired | date:'medium'"
              [class.expiring-soon]="daysLeft(row) !== null && daysLeft(row)! <= 3 && isActive(row)">
            <ng-container *ngIf="row.dateExpired">
              <ng-container *ngIf="isActive(row)">{{ daysLeft(row) }}d</ng-container>
              <ng-container *ngIf="!isActive(row)">{{ row.dateExpired | date:'dd MMM' }}</ng-container>
            </ng-container>
            <ng-container *ngIf="!row.dateExpired">—</ng-container>
          </td>
        </ng-container>

        <!-- Expandable detail row -->
        <ng-container matColumnDef="expandedDetail">
          <td mat-cell *matCellDef="let row" [attr.colspan]="displayedColumns.length">
            <div class="detail-wrap"
                 [@detailExpand]="row === expandedRow ? 'expanded' : 'collapsed'">
              <div class="detail-content">

                <!-- Items loading -->
                <div class="items-loading" *ngIf="itemsLoading[row.contractId]">
                  <mat-spinner diameter="24"></mat-spinner>
                  <span>Loading items…</span>
                </div>

                <!-- No items -->
                <div class="items-empty"
                     *ngIf="!itemsLoading[row.contractId] && items[row.contractId]?.length === 0">
                  <span>No items in this contract.</span>
                </div>

                <!-- Items list -->
                <table class="items-table"
                       *ngIf="!itemsLoading[row.contractId] && (items[row.contractId]?.length ?? 0) > 0">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th class="r">Qty</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let item of items[row.contractId]"
                        [class.excluded]="!item.included">
                      <td>{{ item.typeName }}</td>
                      <td class="r">{{ item.quantity | number }}</td>
                      <td class="notes">
                        <span *ngIf="!item.included" class="tag excluded-tag">Excluded</span>
                        <span *ngIf="item.singleton" class="tag">Fitted</span>
                      </td>
                    </tr>
                  </tbody>
                </table>

              </div>
            </div>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            class="data-row"
            [class.expanded-row]="expandedRow === row"
            [class.expiring-soon-row]="daysLeft(row) !== null && daysLeft(row)! <= 3 && isActive(row)"
            (click)="toggleRow(row)"></tr>
        <tr mat-row *matRowDef="let row; columns: ['expandedDetail']" class="detail-row"></tr>
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
    .outstanding-total { color: #81c784; font-size: 0.85rem; font-weight: 500; margin-left: 8px; }
    .controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .filter-group { display: flex; gap: 6px; }
    .filter-btn { font-size: 0.78rem; min-width: 0; padding: 0 10px; height: 32px; line-height: 32px; }
    .filter-btn.active { border-color: #4dd0e1; color: #4dd0e1; background: rgba(77,208,225,0.08); }
    .refresh-btn { font-size: 0.8rem; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 64px 24px;
      color: rgba(255,255,255,0.3); gap: 12px;
      mat-icon { font-size: 48px; height: 48px; width: 48px; }
      p { margin: 0; font-size: 0.95rem; }
    }
    .empty-state.warn { color: #ffb74d; }
    .empty-state.warn mat-icon { color: #ffb74d; }

    .spinner-wrap { display: flex; justify-content: center; padding: 48px; }

    .table-container { overflow-x: auto; }
    .contracts-table { width: 100%; }

    .data-row { cursor: pointer; }
    .data-row:hover { background: rgba(255,255,255,0.04); }
    .expanded-row { background: rgba(77,208,225,0.05); }
    .detail-row { height: 0; }
    .detail-row td { padding: 0; border-bottom: none; }

    .expand-icon {
      color: rgba(255,255,255,0.3); font-size: 18px;
      transition: transform 200ms ease; display: block;
    }
    .expand-icon.expanded { transform: rotate(90deg); color: #4dd0e1; }

    .badge {
      padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;
    }
    .badge.char { background: rgba(77,208,225,0.2); color: #4dd0e1; }
    .badge.corp { background: rgba(255,215,64,0.2); color: #ffd740; }

    .type-badge {
      padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;
      background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7);
    }
    .type-badge.item_exchange { background: rgba(77,208,225,0.12); color: #4dd0e1; }
    .type-badge.courier       { background: rgba(255,183,77,0.12);  color: #ffb74d; }
    .type-badge.auction       { background: rgba(206,147,216,0.12); color: #ce93d8; }

    .status-badge {
      padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;
      background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5);
    }
    .status-badge.outstanding         { background: rgba(129,199,132,0.15); color: #81c784; }
    .status-badge.in_progress         { background: rgba(77,208,225,0.15);  color: #4dd0e1; }
    .status-badge.finished            { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.35); }
    .status-badge.finished_issuer     { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.35); }
    .status-badge.finished_contractor { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.35); }
    .status-badge.cancelled           { background: rgba(229,115,115,0.15); color: #e57373; }
    .status-badge.rejected            { background: rgba(229,115,115,0.15); color: #e57373; }
    .status-badge.failed              { background: rgba(229,115,115,0.15); color: #e57373; }
    .status-badge.deleted             { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.3); }

    .title-cell { display: flex; flex-direction: column; gap: 2px; }
    .contract-title { font-weight: 500; font-size: 0.9rem; }
    .location { color: rgba(255,255,255,0.5); font-size: 0.78rem; }
    .location.end { color: rgba(255,183,77,0.7); }

    .num { font-variant-numeric: tabular-nums; }
    .reward { color: #81c784; }

    .expiring-soon { color: #ff7043; font-weight: 700; }
    .expiring-soon-row { background: rgba(255,112,67,0.06); }

    /* Detail / items */
    .detail-wrap { overflow: hidden; }
    .detail-content {
      padding: 12px 48px 16px;
      border-top: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,0,0,0.2);
    }

    .items-loading {
      display: flex; align-items: center; gap: 10px;
      color: rgba(255,255,255,0.4); font-size: 0.85rem;
    }
    .items-empty { color: rgba(255,255,255,0.3); font-size: 0.85rem; }

    .items-table { border-collapse: collapse; width: 100%; max-width: 680px; }
    .items-table th {
      text-align: left; font-size: 0.72rem; font-weight: 600;
      color: rgba(255,255,255,0.35); padding: 4px 12px 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .items-table th.r, .items-table td.r { text-align: right; }
    .items-table td {
      font-size: 0.82rem; padding: 5px 12px 5px 0;
      color: rgba(255,255,255,0.8);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-variant-numeric: tabular-nums;
    }
    .items-table tr.excluded td { opacity: 0.45; }
    .notes { display: flex; gap: 4px; }
    .tag {
      font-size: 0.68rem; padding: 1px 5px; border-radius: 3px;
      background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5);
    }
    .tag.excluded-tag { background: rgba(229,115,115,0.15); color: #e57373; }
  `]
})
export class MyContractsComponent implements OnInit {
  private marketService = inject(MarketService);
  private authService   = inject(AuthService);
  private cdr           = inject(ChangeDetectorRef);

  displayedColumns = ['expand', 'source', 'type', 'status', 'title', 'price', 'issued', 'expires'];

  statusFilters = [
    { label: 'All',         value: 'all' },
    { label: 'Outstanding', value: 'outstanding' },
    { label: 'Finished',    value: 'finished' },
  ];

  contracts: MyContract[] = [];
  filtered:  MyContract[] = [];
  statusFilter     = 'all';
  isLoggedIn       = false;
  hasContractScope = false;
  loading          = false;

  expandedRow: MyContract | null = null;
  items:        Record<number, MyContractItem[]> = {};
  itemsLoading: Record<number, boolean>          = {};

  ngOnInit() {
    this.authService.status$.subscribe(s => {
      const wasLoggedIn = this.isLoggedIn;
      this.isLoggedIn       = s.loggedIn;
      this.hasContractScope = s.hasContractScope;
      this.cdr.markForCheck();
      if (s.loggedIn && s.hasContractScope && !wasLoggedIn) this.load();
    });
  }

  load() {
    this.loading     = true;
    this.expandedRow = null;
    this.marketService.getMyContracts().subscribe({
      next: (data) => {
        this.contracts = data;
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); }
    });
  }

  setFilter(value: string) {
    this.statusFilter = value;
    this.expandedRow  = null;
    this.applyFilter();
    this.cdr.markForCheck();
  }

  toggleRow(row: MyContract) {
    if (this.expandedRow === row) {
      this.expandedRow = null;
      return;
    }
    this.expandedRow = row;
    if (this.items[row.contractId] === undefined && !this.itemsLoading[row.contractId]) {
      this.loadItems(row);
    }
  }

  private loadItems(row: MyContract) {
    this.itemsLoading[row.contractId] = true;
    this.marketService.getMyContractItems(row.contractId, row.source).subscribe({
      next: (data) => {
        this.items[row.contractId]        = data;
        this.itemsLoading[row.contractId] = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.items[row.contractId]        = [];
        this.itemsLoading[row.contractId] = false;
        this.cdr.markForCheck();
      }
    });
  }

  private applyFilter() {
    if (this.statusFilter === 'all') {
      this.filtered = this.contracts;
    } else if (this.statusFilter === 'outstanding') {
      this.filtered = this.contracts.filter(c =>
        c.status === 'outstanding' || c.status === 'in_progress');
    } else if (this.statusFilter === 'finished') {
      this.filtered = this.contracts.filter(c =>
        c.status === 'finished' || c.status === 'finished_issuer' || c.status === 'finished_contractor');
    } else {
      this.filtered = this.contracts;
    }
  }

  get outstandingTotal(): number {
    return this.contracts
      .filter(c => c.status === 'outstanding' || c.status === 'in_progress')
      .reduce((sum, c) => sum + (c.price ?? 0), 0);
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      item_exchange: 'Item Exchange',
      courier:       'Courier',
      auction:       'Auction',
      loan:          'Loan',
    };
    return labels[type] ?? type;
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      outstanding:          'Outstanding',
      in_progress:          'In Progress',
      finished:             'Finished',
      finished_issuer:      'Fin. (Issuer)',
      finished_contractor:  'Fin. (Contractor)',
      cancelled:            'Cancelled',
      rejected:             'Rejected',
      failed:               'Failed',
      deleted:              'Deleted',
      reversed:             'Reversed',
    };
    return labels[status] ?? status;
  }

  isActive(contract: MyContract): boolean {
    return contract.status === 'outstanding' || contract.status === 'in_progress';
  }

  daysLeft(contract: MyContract): number | null {
    if (!contract.dateExpired) return null;
    const ms = new Date(contract.dateExpired).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  }
}
