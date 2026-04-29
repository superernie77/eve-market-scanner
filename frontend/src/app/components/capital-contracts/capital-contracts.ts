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
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { ContractService } from '../../services/contract.service';
import { CapitalContract } from '../../models/capital-contract.model';

const REGIONS = [
  { id: 10000001, name: 'Derelik' },
  { id: 10000043, name: 'Domain'  },
];

const GROUP_COLORS: Record<string, string> = {
  'Titan':                 '#ff5252',
  'Supercarrier':          '#ff6e40',
  'Carrier':               '#4dd0e1',
  'Force Auxiliary':       '#40c4ff',
  'Dreadnought':           '#ffd740',
  'Capital Industrial Ship': '#69f0ae',
  'Jump Freighter':        '#ce93d8',
};

@Component({
  selector: 'app-capital-contracts',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatFormFieldModule, MatSelectModule, MatInputModule,
    MatProgressSpinnerModule, MatIconModule, MatTooltipModule,
    MatButtonModule, MatCheckboxModule, MatExpansionModule,
    MatChipsModule, MatPaginatorModule,
  ],
  template: `
    <div class="filter-bar">
      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Region</mat-label>
        <mat-select [formControl]="filterForm.controls.regionId">
          <mat-option [value]="null">All Regions</mat-option>
          <mat-option *ngFor="let r of regions" [value]="r.id">{{ r.name }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Ship Class</mat-label>
        <mat-select [formControl]="filterForm.controls.shipClass">
          <mat-option [value]="null">All Classes</mat-option>
          <mat-option *ngFor="let cls of shipClasses" [value]="cls">{{ cls }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field narrow">
        <mat-label>Max Price (B ISK)</mat-label>
        <input matInput type="number" min="0" [formControl]="filterForm.controls.maxPriceBillions"
               (keyup.enter)="load()">
      </mat-form-field>

      <div class="checkbox-wrap">
        <mat-checkbox [formControl]="filterForm.controls.priceCompleteOnly" color="primary">
          Full pricing only
        </mat-checkbox>
      </div>

      <button mat-flat-button color="primary" (click)="applyFilters()" class="apply-btn">
        <mat-icon>search</mat-icon> Apply
      </button>

      <button mat-stroked-button (click)="triggerScan()" class="scan-btn"
              [disabled]="scanTriggered" matTooltip="Trigger immediate contract scan">
        <mat-icon>refresh</mat-icon> Scan Now
      </button>

      <div class="result-count" *ngIf="!loading">
        <mat-icon>inventory_2</mat-icon>
        {{ totalElements }} contracts
      </div>
    </div>

    <div class="table-container">
      <div class="spinner-overlay" *ngIf="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>

      <table mat-table [dataSource]="dataSource" multiTemplateDataRows matSort (matSortChange)="onSortChange($event)" class="contracts-table">

        <ng-container matColumnDef="shipClass">
          <th mat-header-cell *matHeaderCellDef>Class</th>
          <td mat-cell *matCellDef="let row">
            <span class="ship-class-badge" [style.background]="groupBg(row.capitalGroupName)"
                  [style.color]="groupColor(row.capitalGroupName)">
              {{ row.capitalGroupName }}
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="capitalTypeName">
          <th mat-header-cell *matHeaderCellDef>Ship</th>
          <td mat-cell *matCellDef="let row">
            <span class="ship-name">{{ row.capitalTypeName }}</span>
            <span class="qty-badge" *ngIf="row.capitalQuantity > 1">×{{ row.capitalQuantity }}</span>
            <span class="mixed-badge" *ngIf="row.hasMixedCapitals"
                  matTooltip="Contract contains multiple capital types">mixed</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="region">
          <th mat-header-cell *matHeaderCellDef>Region</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'region r' + row.regionId">{{ row.regionName }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="location">
          <th mat-header-cell *matHeaderCellDef>Location</th>
          <td mat-cell *matCellDef="let row" class="location-cell muted">
            {{ row.startLocationName || '—' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="price">
          <th mat-header-cell *matHeaderCellDef>Contract Price</th>
          <td mat-cell *matCellDef="let row" class="num">{{ formatIsk(row.price) }}</td>
        </ng-container>

        <ng-container matColumnDef="nonCapItemValue">
          <th mat-header-cell *matHeaderCellDef>Extras Value</th>
          <td mat-cell *matCellDef="let row" class="num muted">
            {{ formatIsk(row.nonCapItemValue) }}
          </td>
        </ng-container>

        <ng-container matColumnDef="effectivePricePerUnit">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="effectivePricePerUnit">Effective Cap Price</th>
          <td mat-cell *matCellDef="let row">
            <span class="eff-price" [class.negative]="row.effectivePricePerUnit < 0">
              {{ formatIsk(row.effectivePricePerUnit) }}
            </span>
            <span class="per-unit" *ngIf="!row.hasMixedCapitals && row.capitalQuantity > 1">
              /unit
            </span>
            <mat-icon class="incomplete-icon"
                      *ngIf="row.priceIncomplete"
                      [matTooltip]="'Effective price is approximate — ' + row.unknownPriceItemCount + ' item(s) have no market price data'">
              warning
            </mat-icon>
          </td>
        </ng-container>

        <ng-container matColumnDef="title">
          <th mat-header-cell *matHeaderCellDef>Title</th>
          <td mat-cell *matCellDef="let row" class="muted title-cell"
              [matTooltip]="row.title || ''" [matTooltipDisabled]="!row.title">
            {{ row.title || '—' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="dateExpired">
          <th mat-header-cell *matHeaderCellDef>Expires</th>
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
            <div class="item-detail" [@detailExpand]
                 *ngIf="expandedRow === row">
              <div class="item-list">
                <div class="item-row" *ngFor="let item of row.items"
                     [class.cap-item]="item.isCapital">
                  <span class="item-qty">{{ item.quantity }}×</span>
                  <span class="item-name">{{ item.typeName }}</span>
                  <span class="item-value" *ngIf="!item.isCapital && item.estimatedValue != null">
                    ≈ {{ formatIsk(item.estimatedValue) }}
                  </span>
                  <span class="item-value no-price" *ngIf="!item.isCapital && item.estimatedValue == null">
                    no price data
                  </span>
                  <span class="cap-tag" *ngIf="item.isCapital">CAPITAL</span>
                </div>
              </div>
            </div>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            class="main-row"
            [class.expanded-row]="expandedRow === row"></tr>
        <tr mat-row *matRowDef="let row; columns: ['expandedDetail']"
            class="detail-row"></tr>

        <tr class="mat-row" *matNoDataRow>
          <td class="mat-cell no-data" [attr.colspan]="displayedColumns.length">
            {{ loading ? '' : 'No capital contracts found. Contracts scan runs every 30 min — click Scan Now to trigger immediately.' }}
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
    .filter-field.narrow { min-width: 120px; max-width: 150px; }
    .checkbox-wrap { display: flex; align-items: center; padding-bottom: 4px; }
    .apply-btn, .scan-btn { align-self: center; height: 40px; }
    .scan-btn { margin-left: -8px; }
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

    .contracts-table { width: 100%; }

    .ship-class-badge {
      font-size: 0.75rem; font-weight: 700;
      padding: 2px 8px; border-radius: 4px;
      white-space: nowrap;
    }
    .ship-name { font-weight: 500; }
    .qty-badge {
      margin-left: 6px; font-size: 0.75rem;
      color: #ffd740; font-weight: 700;
    }
    .mixed-badge {
      margin-left: 6px; font-size: 0.7rem; font-weight: 600;
      color: #ff9800; border: 1px solid rgba(255,152,0,0.4);
      padding: 1px 5px; border-radius: 3px;
    }

    .region { font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; }
    .r10000001 { background: rgba(255,152,0,0.15);  color: #ffb74d; }
    .r10000043 { background: rgba(239,154,154,0.15); color: #ef9a9a; }

    .num  { font-variant-numeric: tabular-nums; }
    .muted { color: rgba(255,255,255,0.5); }
    .title-cell { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .location-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; }

    .eff-price { font-weight: 700; color: #69f0ae; }
    .eff-price.negative { color: #ff5252; }
    .per-unit { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-left: 3px; }
    .incomplete-icon { font-size: 16px; height: 16px; width: 16px; color: #ff9800; vertical-align: middle; margin-left: 4px; }

    .no-data { text-align: center; padding: 48px; color: rgba(255,255,255,0.4); }

    .main-row { cursor: default; }
    .detail-row { height: 0; }
    .detail-row td { padding: 0; border: none; }
    .expanded-row { background: rgba(255,255,255,0.03); }

    .item-detail {
      overflow: hidden;
      padding: 8px 16px 16px 32px;
    }
    .item-list { display: flex; flex-direction: column; gap: 4px; }
    .item-row {
      display: flex; align-items: center; gap: 10px;
      font-size: 0.85rem; padding: 3px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .item-row.cap-item { background: rgba(105,240,174,0.05); border-radius: 4px; padding: 3px 6px; }
    .item-qty { color: rgba(255,255,255,0.4); min-width: 32px; text-align: right; }
    .item-name { flex: 1; }
    .item-value { color: rgba(255,255,255,0.5); font-variant-numeric: tabular-nums; }
    .item-value.no-price { color: #ff9800; font-size: 0.75rem; }
    .cap-tag {
      font-size: 0.65rem; font-weight: 700;
      color: #69f0ae; border: 1px solid rgba(105,240,174,0.4);
      padding: 1px 5px; border-radius: 3px; letter-spacing: 0.05em;
    }
  `]
})
export class CapitalContractsComponent implements OnInit {
  private contractService = inject(ContractService);
  private fb = inject(FormBuilder);

  @ViewChild(MatSort) matSort!: MatSort;

  regions = REGIONS;
  shipClasses = Object.keys(GROUP_COLORS);

  displayedColumns = [
    'shipClass', 'capitalTypeName', 'region', 'location',
    'price', 'nonCapItemValue', 'effectivePricePerUnit',
    'title', 'dateExpired', 'expand'
  ];

  dataSource = new MatTableDataSource<CapitalContract>([]);
  loading = false;
  scanTriggered = false;
  totalElements = 0;
  pageSize = 50;
  currentPage = 0;

  expandedRow: CapitalContract | null = null;
  sortBy  = 'effectivePricePerUnit';
  sortDir = 'asc';

  filterForm = this.fb.group({
    regionId:          [null as number | null],
    shipClass:         [null as string | null],
    maxPriceBillions:  [null as number | null],
    priceCompleteOnly: [false],
  });

  ngOnInit() {
    this.load();
    // Auto-apply when either dropdown changes — no typing involved so no debounce needed
    this.filterForm.controls.regionId.valueChanges.subscribe(() => this.applyFilters());
    this.filterForm.controls.shipClass.valueChanges.subscribe(() => this.applyFilters());
  }

  applyFilters() {
    this.currentPage = 0;
    this.load();
  }

  load() {
    this.loading = true;
    this.expandedRow = null;
    const v = this.filterForm.value;

    this.contractService.getCapitalContracts({
      regionId:          v.regionId ?? null,
      maxPrice:          v.maxPriceBillions != null ? v.maxPriceBillions * 1_000_000_000 : null,
      priceCompleteOnly: v.priceCompleteOnly ?? false,
      page:              this.currentPage,
      size:              this.pageSize,
      sortBy:            this.sortBy,
      sortDir:           this.sortDir,
    }).subscribe({
      next: (page) => {
        let rows = page.content;
        const cls = v.shipClass;
        if (cls) rows = rows.filter(r => r.capitalGroupName === cls);
        this.dataSource.data = rows;
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
    this.sortBy  = sort.active || 'effectivePricePerUnit';
    this.sortDir = sort.direction || 'asc';
    this.currentPage = 0;
    this.load();
  }

  toggleExpand(row: CapitalContract, event: Event) {
    event.stopPropagation();
    this.expandedRow = this.expandedRow === row ? null : row;
  }

  triggerScan() {
    this.scanTriggered = true;
    this.contractService.triggerScan().subscribe({
      next: () => setTimeout(() => { this.scanTriggered = false; this.load(); }, 3000),
      error: () => { this.scanTriggered = false; }
    });
  }

  groupColor(groupName: string): string {
    return GROUP_COLORS[groupName] ?? 'rgba(255,255,255,0.7)';
  }

  groupBg(groupName: string): string {
    const color = GROUP_COLORS[groupName] ?? 'rgba(255,255,255,0.7)';
    return color + '22';
  }

  formatIsk(value: number): string {
    if (value == null) return '—';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B ISK`;
    if (abs >= 1_000_000)     return `${sign}${(abs / 1_000_000).toFixed(1)}M ISK`;
    return `${sign}${abs.toLocaleString()} ISK`;
  }
}
