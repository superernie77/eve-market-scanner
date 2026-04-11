import { Component, OnInit, AfterViewInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MarketService } from '../../services/market.service';
import { AuthService } from '../../services/auth.service';
import { ArbitrageOpportunity } from '../../models/market-offer.model';

@Component({
  selector: 'app-arbitrage',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatTableModule, MatFormFieldModule, MatSelectModule, MatInputModule,
    MatSliderModule, MatProgressSpinnerModule, MatIconModule, MatTooltipModule,
    MatButtonModule, MatChipsModule, MatSortModule
  ],
  template: `
    <div class="filter-bar">
      <mat-form-field appearance="outline" class="filter-field search-field">
        <mat-label>Search Item Name</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [formControl]="filterForm.controls.typeNameSearch" placeholder="e.g. PLEX" (keyup.enter)="load()">
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Category</mat-label>
        <mat-select [formControl]="filterForm.controls.categoryName">
          <mat-option [value]="null">All Categories</mat-option>
          <mat-option *ngFor="let cat of categories" [value]="cat">{{ cat }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field narrow">
        <mat-label>Min Gap %</mat-label>
        <input matInput type="number" min="0" max="500"
               [formControl]="filterForm.controls.minGapPercent" (keyup.enter)="load()">
      </mat-form-field>

      <button mat-flat-button color="primary" (click)="load()" class="apply-btn">
        <mat-icon>search</mat-icon> Apply
      </button>

      <div class="result-count" *ngIf="!loading">
        <mat-icon>swap_horiz</mat-icon>
        {{ dataSource.data.length }} opportunities found
      </div>

    </div>

    <div class="slider-bar">
      <div class="slider-label">
        <mat-icon>filter_list</mat-icon>
        Avg. Price Range:
        <strong>{{ formatIsk(filterForm.controls.minAvgPriceMillion.value ?? 0) }} – {{ formatIsk(filterForm.controls.maxAvgPriceMillion.value ?? 1000, true) }}</strong>
      </div>
      <span class="slider-bounds">0</span>
      <mat-slider min="0" max="1000" step="5" class="price-slider">
        <input matSliderStartThumb [formControl]="filterForm.controls.minAvgPriceMillion">
        <input matSliderEndThumb [formControl]="filterForm.controls.maxAvgPriceMillion">
      </mat-slider>
      <span class="slider-bounds">1B ISK</span>
    </div>

    <div class="table-container">
      <div class="spinner-overlay" *ngIf="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>

      <table mat-table [dataSource]="dataSource" matSort class="arb-table">

        <ng-container matColumnDef="typeName">
          <th mat-header-cell *matHeaderCellDef>Item</th>
          <td mat-cell *matCellDef="let row">
            <span class="item-name">{{ row.typeName }}</span>
            <span class="type-id">#{{ row.typeId }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="buyRegion">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="buyRegionName">Buy In</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'region r' + row.buyRegionId">{{ row.buyRegionName }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="buyPrice">
          <th mat-header-cell *matHeaderCellDef>Buy Price (ISK)</th>
          <td mat-cell *matCellDef="let row" class="num">{{ row.buyPrice | number:'1.2-2' }}</td>
        </ng-container>

        <ng-container matColumnDef="sellRegion">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="sellRegionName">Sell In</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'region r' + row.sellRegionId">{{ row.sellRegionName }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="sellPrice">
          <th mat-header-cell *matHeaderCellDef>Sell Price (ISK)</th>
          <td mat-cell *matCellDef="let row" class="num">{{ row.sellPrice | number:'1.2-2' }}</td>
        </ng-container>

        <ng-container matColumnDef="gapPercent">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="gapPercent">Gap</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="gapClass(row.gapPercent)">+{{ row.gapPercent | number:'1.1-1' }}%</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="volumeAvailable">
          <th mat-header-cell *matHeaderCellDef>Volume</th>
          <td mat-cell *matCellDef="let row"
              matTooltip="Units available at buy region">
            {{ row.volumeAvailable | number }}
          </td>
        </ng-container>

        <ng-container matColumnDef="averagePrice">
          <th mat-header-cell *matHeaderCellDef>Avg Price (ISK)</th>
          <td mat-cell *matCellDef="let row" class="num muted">
            {{ row.averagePrice != null ? (row.averagePrice | number:'1.0-0') : '—' }}
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            [class.high-gap]="row.gapPercent >= 50 && !row.alreadyListed"
            [class.already-listed]="row.alreadyListed"
            [matTooltip]="row.alreadyListed ? 'You already have a sell order for this item' : ''"></tr>

        <tr class="mat-row" *matNoDataRow>
          <td class="mat-cell no-data" [attr.colspan]="displayedColumns.length">
            {{ loading ? '' : 'No arbitrage opportunities found. Make sure all 4 regions have been scanned.' }}
          </td>
        </tr>
      </table>
    </div>
  `,
  styles: [`
    .filter-bar {
      display: flex; gap: 16px; align-items: center;
      flex-wrap: wrap; margin-bottom: 8px;
    }
    .filter-field { min-width: 160px; }
    .filter-field.narrow { min-width: 90px; max-width: 110px; }
    .search-field { min-width: 220px; }
    .apply-btn { align-self: center; height: 40px; }
    .result-count {
      display: flex; align-items: center; gap: 6px;
      color: rgba(255,255,255,0.5); font-size: 0.85rem;
      mat-icon { font-size: 18px; height: 18px; width: 18px; }
    }
    .slider-bar {
      display: flex; align-items: center; gap: 12px;
      margin-bottom: 16px; background: rgba(255,255,255,0.04);
      border-radius: 8px; padding: 10px 16px;
    }
    .slider-label {
      display: flex; align-items: center; gap: 6px;
      white-space: nowrap; min-width: 280px; font-size: 0.9rem;
      mat-icon { font-size: 18px; height: 18px; width: 18px; color: rgba(255,255,255,0.5); }
      strong { color: #4dd0e1; margin-left: 4px; }
    }
    .price-slider { flex: 1; }
    .slider-bounds { font-size: 0.75rem; color: rgba(255,255,255,0.4); white-space: nowrap; }

    .table-container { position: relative; overflow-x: auto; }
    .spinner-overlay {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.3); z-index: 10; min-height: 120px;
    }
    .arb-table { width: 100%; }

    /* Region color badges */
    .region {
      font-weight: 600; padding: 2px 10px;
      border-radius: 4px; font-size: 0.8rem; white-space: nowrap;
    }
    .r10000002 { background: rgba(255,215,64,0.15);  color: #ffd740; }  /* The Forge  - gold  */
    .r10000043 { background: rgba(239,154,154,0.15); color: #ef9a9a; }  /* Domain     - red   */
    .r10000032 { background: rgba(144,202,249,0.15); color: #90caf9; }  /* Sinq Laison- blue  */
    .r10000030 { background: rgba(165,214,167,0.15); color: #a5d6a7; }  /* Heimatar   - green */
    .r10000042 { background: rgba(206,147,216,0.15); color: #ce93d8; }  /* Metropolis - purple */

    /* Gap colour scale */
    .gap-ok    { color: #ff9800; font-weight: 600; }
    .gap-good  { color: #4caf50; font-weight: 700; }
    .gap-great { color: #69f0ae; font-weight: 700; font-size: 1.05em; }

    .high-gap { background: rgba(105,240,174,0.05); }
    .already-listed { opacity: 0.3; filter: grayscale(0.9); pointer-events: none; }
    .already-listed td { color: rgba(255,255,255,0.25) !important; }
    .num  { font-variant-numeric: tabular-nums; }
    .muted { color: rgba(255,255,255,0.5); }
    .item-name { font-weight: 500; }
    .type-id { color: rgba(255,255,255,0.4); font-size: 0.75rem; margin-left: 6px; }
    .no-data { text-align: center; padding: 48px; color: rgba(255,255,255,0.4); }
  `]
})
export class ArbitrageComponent implements OnInit, AfterViewInit {
  private marketService = inject(MarketService);
  private authService   = inject(AuthService);
  private fb = inject(FormBuilder);

  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns = [
    'typeName', 'buyRegion', 'buyPrice',
    'sellRegion', 'sellPrice', 'gapPercent',
    'volumeAvailable', 'averagePrice'
  ];

  dataSource = new MatTableDataSource<ArbitrageOpportunity>([]);
  categories: string[] = [];
  loading = false;

  filterForm = this.fb.group({
    typeNameSearch:     [null as string | null],
    categoryName:       [null as string | null],
    minGapPercent:      [5],
    minAvgPriceMillion: [100],
    maxAvgPriceMillion: [1000]
  });

  ngOnInit() {
    this.marketService.getCategories().subscribe(cats => this.categories = cats);
    this.load();
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (row, id) => {
      switch (id) {
        case 'buyRegionName':  return row.buyRegionName;
        case 'sellRegionName': return row.sellRegionName;
        default: return (row as any)[id] ?? '';
      }
    };
    this.sort.sort({ id: 'gapPercent', start: 'desc', disableClear: false });
  }

  load() {
    this.loading = true;
    const v = this.filterForm.value;
    const minMillions = v.minAvgPriceMillion ?? 0;
    const maxMillions = v.maxAvgPriceMillion ?? 1000;

    this.marketService.getArbitrageOpportunities({
      minAveragePrice: minMillions > 0 ? minMillions * 1_000_000 : null,
      maxAveragePrice: maxMillions < 1000 ? maxMillions * 1_000_000 : null,
      typeName:        v.typeNameSearch ?? null,
      categoryName:    v.categoryName ?? null,
      minGapPercent:   v.minGapPercent ?? 5,
      limit:           100
    }).subscribe({
      next: (data) => { this.dataSource.data = data; this.loading = false; },
      error: ()     => { this.loading = false; }
    });
  }

  gapClass(gap: number): string {
    if (gap >= 50) return 'gap-great';
    if (gap >= 20) return 'gap-good';
    return 'gap-ok';
  }

  formatIsk(millions: number, isMax = false): string {
    if (isMax && millions >= 1000) return 'No limit';
    if (millions === 0) return 'No minimum';
    if (millions >= 1000) return `${(millions / 1000).toFixed(millions % 1000 === 0 ? 0 : 1)}B ISK`;
    return `${millions}M ISK`;
  }
}
