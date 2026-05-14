import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { ContractService } from '../../services/contract.service';
import { CapitalContract } from '../../models/capital-contract.model';

const REGIONS = [
  { id: 10000001, name: 'Derelik' },
  { id: 10000043, name: 'Domain'  },
  { id: 10000036, name: 'Devoid'  },
];

const GROUP_COLORS: Record<string, string> = {
  'Titan':                   '#ff5252',
  'Supercarrier':            '#ff6e40',
  'Carrier':                 '#4dd0e1',
  'Force Auxiliary':         '#40c4ff',
  'Dreadnought':             '#ffd740',
  'Capital Industrial Ship': '#69f0ae',
  'Jump Freighter':          '#ce93d8',
};

@Component({
  selector: 'app-contract-deals',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatFormFieldModule, MatSelectModule, MatInputModule,
    MatProgressSpinnerModule, MatIconModule, MatTooltipModule,
    MatButtonModule, MatCheckboxModule, MatPaginatorModule,
  ],
  template: `
    <div class="filter-bar">
      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Region</mat-label>
        <mat-select [formControl]="filterForm.controls.regionId">
          <mat-option [value]="null">All Regions</mat-option>
          @for (r of regions; track r.id) {
            <mat-option [value]="r.id">{{ r.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field narrow">
        <mat-label>Min Value (B ISK)</mat-label>
        <input matInput type="number" min="0" [formControl]="filterForm.controls.minContractValueB"
               (keyup.enter)="load()">
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field narrow">
        <mat-label>Min Savings (B ISK)</mat-label>
        <input matInput type="number" min="0" [formControl]="filterForm.controls.minAbsDiffB"
               (keyup.enter)="load()">
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field narrow">
        <mat-label>Min Savings (%)</mat-label>
        <input matInput type="number" min="0" max="100" [formControl]="filterForm.controls.minPctDiff"
               (keyup.enter)="load()">
      </mat-form-field>

      <button mat-flat-button color="primary" (click)="applyFilters()" class="apply-btn">
        <mat-icon>search</mat-icon> Apply
      </button>

      @if (!loading) {
        <div class="result-count">
          <mat-icon>local_offer</mat-icon>
          {{ totalElements }} deals
        </div>
      }
    </div>

    <div class="table-container">
      @if (loading) {
        <div class="spinner-overlay">
          <mat-spinner diameter="48"></mat-spinner>
        </div>
      }

      <table mat-table [dataSource]="dataSource" multiTemplateDataRows matSort (matSortChange)="onSortChange($event)" class="deals-table">

        <ng-container matColumnDef="shipClass">
          <th mat-header-cell *matHeaderCellDef>Class</th>
          <td mat-cell *matCellDef="let row">
            @if (row.capitalGroupName) {
              <span class="ship-class-badge" [style.background]="groupBg(row.capitalGroupName)"
                    [style.color]="groupColor(row.capitalGroupName)">
                {{ row.capitalGroupName }}
              </span>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="capitalTypeName">
          <th mat-header-cell *matHeaderCellDef>Ship / Title</th>
          <td mat-cell *matCellDef="let row">
            <span class="ship-name">{{ row.capitalTypeName ?? row.title ?? 'Item Exchange' }}</span>
            @if (row.capitalQuantity && row.capitalQuantity > 1) {
              <span class="qty-badge">×{{ row.capitalQuantity }}</span>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="region">
          <th mat-header-cell *matHeaderCellDef>Region</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'region r' + row.regionId">{{ row.regionName }}</span>
            @if (row.startSystemName) {
              <div class="system-name">{{ row.startSystemName }}</div>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="itemCount">
          <th mat-header-cell *matHeaderCellDef>Items / Vol</th>
          <td mat-cell *matCellDef="let row" class="items-vol">
            <span class="muted">{{ row.itemCount ?? '—' }} items</span>
            @if (row.volume != null) {
              <div class="muted vol-line">{{ formatVolume(row.volume) }}</div>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="price">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="price">Contract Price</th>
          <td mat-cell *matCellDef="let row" class="num">{{ formatIsk(row.price) }}</td>
        </ng-container>

        <ng-container matColumnDef="totalItemValue">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="totalItemValue">Item Value</th>
          <td mat-cell *matCellDef="let row" class="num">
            {{ formatIsk(row.totalItemValue) }}
            @if (row.totalValueIncomplete) {
              <mat-icon class="incomplete-icon"
                        matTooltip="Item value is approximate — some items have no market price data">warning</mat-icon>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="valueDiff">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="valueDiff">Savings</th>
          <td mat-cell *matCellDef="let row">
            <span class="savings" [class.negative]="row.valueDiff < 0">
              {{ formatIsk(row.valueDiff) }}
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="valueDiffPct">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="valueDiffPct">Savings %</th>
          <td mat-cell *matCellDef="let row">
            @if (row.valueDiffPct != null) {
              <span class="pct-badge" [class.negative]="row.valueDiffPct < 0">
                {{ row.valueDiffPct >= 0 ? '+' : '' }}{{ row.valueDiffPct | number:'1.1-1' }}%
              </span>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="dateExpired">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="dateExpired">Expires</th>
          <td mat-cell *matCellDef="let row" class="muted">
            {{ row.dateExpired | date:'dd MMM HH:mm' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="expand">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let row">
            <button mat-icon-button (click)="toggleExpand(row, $event)"
                    [matTooltip]="expandedRow === row ? 'Collapse' : 'Show items'">
              <mat-icon>{{ expandedRow === row ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
          </td>
        </ng-container>

        <ng-container matColumnDef="expandedDetail">
          <td mat-cell *matCellDef="let row" [attr.colspan]="displayedColumns.length">
            @if (expandedRow === row) {
              <div class="item-detail">
                <div class="item-list">
                  @for (item of row.items; track item.typeId) {
                    <div class="item-row"
                         [class.cap-item]="item.isCapital"
                         [class.rig-item]="item.isRig">
                      <span class="item-qty">{{ item.quantity }}×</span>
                      <span class="item-name">{{ item.typeName }}</span>
                      @if (item.packagedVolume != null) {
                        <span class="item-vol">{{ formatVolume(item.packagedVolume * item.quantity) }}</span>
                      }
                      @if (item.estimatedValue != null) {
                        <span class="item-value">≈ {{ formatIsk(item.estimatedValue) }}</span>
                      }
                      @if (!item.isCapital && item.estimatedValue == null) {
                        <span class="item-value no-price">no price data</span>
                      }
                      @if (item.isCapital) {
                        <span class="cap-tag">CAPITAL</span>
                      }
                      @if (item.isRig) {
                        <span class="rig-tag">RIG</span>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            class="main-row" [class.expanded-row]="expandedRow === row"></tr>
        <tr mat-row *matRowDef="let row; columns: ['expandedDetail']" class="detail-row"></tr>

        <tr class="mat-row" *matNoDataRow>
          <td class="mat-cell no-data" [attr.colspan]="displayedColumns.length">
            {{ loading ? '' : 'No deals found matching the current filters.' }}
          </td>
        </tr>
      </table>

      <mat-paginator [length]="totalElements"
                     [pageSize]="pageSize"
                     [pageSizeOptions]="[25, 50, 100]"
                     (page)="onPage($event)"
                     showFirstLastButtons>
      </mat-paginator>
    </div>
  `,
  styles: [`
    .filter-bar {
      display: flex; gap: 16px; align-items: center;
      flex-wrap: wrap; margin-bottom: 16px;
    }
    .filter-field { min-width: 150px; }
    .filter-field.narrow { min-width: 130px; max-width: 160px; }
    .apply-btn { align-self: center; height: 40px; }
    .result-count {
      display: flex; align-items: center; gap: 6px;
      color: rgba(255,255,255,0.5); font-size: 0.85rem;
    }

    .table-container { position: relative; overflow-x: auto; }
    .spinner-overlay {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.3); z-index: 10; min-height: 120px;
    }

    .deals-table { width: 100%; }

    .ship-class-badge {
      font-size: 0.75rem; font-weight: 700;
      padding: 2px 8px; border-radius: 4px; white-space: nowrap;
    }
    .ship-name { font-weight: 500; }
    .qty-badge {
      margin-left: 6px; font-size: 0.75rem;
      color: #ffd740; font-weight: 700;
    }

    .region { font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; }
    .system-name { font-size: 0.75rem; color: rgba(255,255,255,0.45); margin-top: 2px; padding-left: 8px; }
    .items-vol { white-space: nowrap; }
    .vol-line { font-size: 0.75rem; }
    .r10000001 { background: rgba(255,152,0,0.15);   color: #ffb74d; }
    .r10000043 { background: rgba(239,154,154,0.15); color: #ef9a9a; }
    .r10000036 { background: rgba(144,202,249,0.15); color: #90caf9; }

    .num { font-variant-numeric: tabular-nums; }
    .muted { color: rgba(255,255,255,0.5); }

    .savings { font-weight: 700; color: #69f0ae; }
    .savings.negative { color: #ff5252; }

    .pct-badge {
      display: inline-block; font-weight: 700; font-size: 0.9rem;
      color: #69f0ae;
    }
    .pct-badge.negative { color: #ff5252; }

    .incomplete-icon { font-size: 14px; height: 14px; width: 14px; color: #ff9800; vertical-align: middle; margin-left: 4px; }

    .no-data { text-align: center; padding: 48px; color: rgba(255,255,255,0.4); }
    .main-row { cursor: default; }
    .detail-row { height: 0; }
    .detail-row td { padding: 0; border: none; }
    .expanded-row { background: rgba(255,255,255,0.03); }

    .item-detail { overflow: hidden; padding: 8px 16px 16px 32px; }
    .item-list { display: flex; flex-direction: column; gap: 4px; }
    .item-row {
      display: flex; align-items: center; gap: 10px;
      font-size: 0.85rem; padding: 3px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .item-row.cap-item { background: rgba(105,240,174,0.08); border-left: 2px solid rgba(105,240,174,0.5); border-radius: 4px; padding: 3px 6px; }
    .item-row.rig-item { background: rgba(179,136,255,0.12); border-left: 2px solid rgba(179,136,255,0.6); border-radius: 4px; padding: 3px 6px; }
    .item-qty { color: rgba(255,255,255,0.4); min-width: 32px; text-align: right; }
    .item-name { flex: 1; }
    .item-vol { color: rgba(255,255,255,0.3); font-variant-numeric: tabular-nums; font-size: 0.8rem; min-width: 72px; text-align: right; }
    .item-value { color: rgba(255,255,255,0.5); font-variant-numeric: tabular-nums; }
    .item-value.no-price { color: #ff9800; font-size: 0.75rem; }
    .cap-tag {
      font-size: 0.65rem; font-weight: 700;
      color: #69f0ae; border: 1px solid rgba(105,240,174,0.4);
      padding: 1px 5px; border-radius: 3px; letter-spacing: 0.05em;
    }
    .rig-tag {
      font-size: 0.65rem; font-weight: 700;
      color: #b39ddb; border: 1px solid rgba(179,136,255,0.4);
      padding: 1px 5px; border-radius: 3px; letter-spacing: 0.05em;
    }
  `]
})
export class ContractDealsComponent implements OnInit {
  private contractService = inject(ContractService);
  private fb = inject(FormBuilder);

  @ViewChild(MatSort) matSort!: MatSort;

  regions = REGIONS;

  displayedColumns = [
    'shipClass', 'capitalTypeName', 'region',
    'price', 'totalItemValue', 'valueDiff', 'valueDiffPct',
    'itemCount', 'dateExpired', 'expand'
  ];

  dataSource = new MatTableDataSource<CapitalContract>([]);
  loading = false;
  totalElements = 0;
  pageSize = 50;
  currentPage = 0;
  expandedRow: CapitalContract | null = null;
  sortBy  = 'valueDiff';
  sortDir = 'desc';

  filterForm = this.fb.group({
    regionId:           [null as number | null],
    minContractValueB:  [1 as number | null],
    minAbsDiffB:        [null as number | null],
    minPctDiff:         [null as number | null],
  });

  ngOnInit() {
    this.load();
    this.filterForm.controls.regionId.valueChanges.subscribe(() => this.applyFilters());
  }

  applyFilters() {
    this.currentPage = 0;
    this.load();
  }

  load() {
    this.loading = true;
    this.expandedRow = null;
    const v = this.filterForm.value;

    this.contractService.getContractDeals({
      regionId:         v.regionId ?? null,
      minContractValue: v.minContractValueB != null ? v.minContractValueB * 1_000_000_000 : 1_000_000_000,
      minAbsDiff:       v.minAbsDiffB != null ? v.minAbsDiffB * 1_000_000_000 : null,
      minPctDiff:       v.minPctDiff ?? 0,
      page:             this.currentPage,
      size:             this.pageSize,
      sortBy:           this.sortBy,
      sortDir:          this.sortDir,
    }).subscribe({
      next: (page) => {
        this.dataSource.data = page.content;
        this.totalElements = page.page?.totalElements ?? 0;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onPage(e: PageEvent) {
    this.currentPage = e.pageIndex;
    this.pageSize    = e.pageSize;
    this.load();
  }

  onSortChange(sort: Sort) {
    this.sortBy  = sort.active || 'valueDiff';
    this.sortDir = sort.direction || 'desc';
    this.currentPage = 0;
    this.load();
  }

  toggleExpand(row: CapitalContract, event: Event) {
    event.stopPropagation();
    this.expandedRow = this.expandedRow === row ? null : row;
  }

  groupColor(groupName: string): string {
    return GROUP_COLORS[groupName] ?? 'rgba(255,255,255,0.7)';
  }

  groupBg(groupName: string): string {
    return (GROUP_COLORS[groupName] ?? 'rgba(255,255,255,0.7)') + '22';
  }

  formatVolume(value: number | null): string {
    if (value == null) return '—';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M m³`;
    if (value >= 1_000)     return `${(value / 1_000).toFixed(1)}k m³`;
    return `${value.toLocaleString()} m³`;
  }

  formatIsk(value: number | null): string {
    if (value == null) return '—';
    const sign = value < 0 ? '-' : '';
    return `${sign}${(Math.abs(value) / 1_000_000).toFixed(2)}M ISK`;
  }
}
