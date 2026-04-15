import { Component, OnInit, OnDestroy, AfterViewInit, Output, EventEmitter, ViewChild, inject } from '@angular/core';
import { Subscription, merge } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MarketService, OrderFilter } from '../../services/market.service';
import { FavouritesService } from '../../services/favourites.service';
import { MarketOffer, Page } from '../../models/market-offer.model';

@Component({
  selector: 'app-market-table',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatTableModule, MatPaginatorModule, MatSortModule,
    MatInputModule, MatSelectModule, MatCheckboxModule,
    MatFormFieldModule, MatSliderModule, MatProgressSpinnerModule,
    MatTooltipModule, MatIconModule, MatButtonModule
  ],
  template: `
    <div class="filter-bar">
      <mat-form-field appearance="outline" class="filter-field search-field">
        <mat-label>Search Item Name</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [formControl]="filterForm.controls.typeNameSearch" placeholder="e.g. Tritanium">
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Type ID</mat-label>
        <input matInput type="number" [formControl]="filterForm.controls.typeId" placeholder="e.g. 34">
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Region</mat-label>
        <mat-select [formControl]="filterForm.controls.regionId">
          <mat-option [value]="null">All Regions</mat-option>
          <mat-option *ngFor="let r of regions" [value]="r.id">{{ r.name }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Order Type</mat-label>
        <mat-select [formControl]="filterForm.controls.isBuyOrder">
          <mat-option [value]="null">Both</mat-option>
          <mat-option [value]="false">Sell Orders</mat-option>
          <mat-option [value]="true">Buy Orders</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Category</mat-label>
        <mat-select [formControl]="filterForm.controls.categoryName">
          <mat-option [value]="null">All Categories</mat-option>
          <mat-option *ngFor="let cat of categories" [value]="cat">{{ cat }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-checkbox color="primary" [formControl]="filterForm.controls.goodDealsOnly">
        Good Deals Only (&ge;20% below avg)
      </mat-checkbox>

      <button mat-flat-button color="primary" (click)="applyFilters()" class="apply-btn">
        <mat-icon>search</mat-icon> Apply
      </button>
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

      <table mat-table [dataSource]="orders" matSort (matSortChange)="onSortChange($event)" class="market-table">

        <ng-container matColumnDef="favourite">
          <th mat-header-cell *matHeaderCellDef class="fav-col"></th>
          <td mat-cell *matCellDef="let row" class="fav-col">
            <button mat-icon-button
                    [class.fav-active]="isFav(row.typeId)"
                    [matTooltip]="isFav(row.typeId) ? 'Remove from favourites' : 'Add to favourites'"
                    (click)="toggleFav(row)">
              <mat-icon>{{ isFav(row.typeId) ? 'star' : 'star_border' }}</mat-icon>
            </button>
          </td>
        </ng-container>

        <ng-container matColumnDef="typeName">
          <th mat-header-cell *matHeaderCellDef mat-sort-header>Item</th>
          <td mat-cell *matCellDef="let row">
            <span class="item-name">{{ row.typeName }}</span>
            <span class="type-id">#{{ row.typeId }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="systemName">
          <th mat-header-cell *matHeaderCellDef>System</th>
          <td mat-cell *matCellDef="let row">
            <span [class.jita]="row.systemName === 'Jita'">{{ row.systemName ?? '—' }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="price">
          <th mat-header-cell *matHeaderCellDef mat-sort-header>Price (ISK)</th>
          <td mat-cell *matCellDef="let row">{{ row.price | number:'1.2-2' }}</td>
        </ng-container>

        <ng-container matColumnDef="averagePrice">
          <th mat-header-cell *matHeaderCellDef>Avg Price (ISK)</th>
          <td mat-cell *matCellDef="let row">
            {{ row.averagePrice != null ? (row.averagePrice | number:'1.2-2') : '—' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="discountPercent">
          <th mat-header-cell *matHeaderCellDef mat-sort-header>Discount</th>
          <td mat-cell *matCellDef="let row">
            <span *ngIf="row.discountPercent != null"
                  [class.good-deal]="row.discountPercent >= 20"
                  [class.ok-deal]="row.discountPercent >= 10 && row.discountPercent < 20">
              {{ row.discountPercent | number:'1.1-1' }}%
            </span>
            <span *ngIf="row.discountPercent == null">—</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="volumeRemain">
          <th mat-header-cell *matHeaderCellDef>Volume</th>
          <td mat-cell *matCellDef="let row">{{ row.volumeRemain | number }}</td>
        </ng-container>

        <ng-container matColumnDef="isBuyOrder">
          <th mat-header-cell *matHeaderCellDef>Type</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="row.isBuyOrder ? 'badge buy' : 'badge sell'">
              {{ row.isBuyOrder ? 'BUY' : 'SELL' }}
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="range">
          <th mat-header-cell *matHeaderCellDef>Range</th>
          <td mat-cell *matCellDef="let row">{{ row.range }}</td>
        </ng-container>

        <ng-container matColumnDef="discoveredAt">
          <th mat-header-cell *matHeaderCellDef>Discovered</th>
          <td mat-cell *matCellDef="let row" [matTooltip]="row.discoveredAt | date:'medium'">
            {{ row.discoveredAt | date:'HH:mm' }}
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            [class.deal-row]="row.discountPercent >= 20"></tr>

        <tr class="mat-row" *matNoDataRow>
          <td class="mat-cell no-data" [attr.colspan]="displayedColumns.length">
            {{ loading ? '' : 'No orders found. Try adjusting filters or trigger a scan.' }}
          </td>
        </tr>
      </table>
    </div>

    <mat-paginator
      [length]="totalElements"
      [pageSize]="pageSize"
      [pageSizeOptions]="[25, 50, 100]"
      (page)="onPageChange($event)"
      showFirstLastButtons>
    </mat-paginator>
  `,
  styles: [`
    .filter-bar {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .filter-field { min-width: 160px; }
    .search-field { min-width: 220px; }
    .apply-btn { align-self: center; height: 40px; }

    .slider-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      background: rgba(255,255,255,0.04);
      border-radius: 8px;
      padding: 10px 16px;
    }
    .slider-label {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      min-width: 280px;
      font-size: 0.9rem;
      mat-icon { font-size: 18px; height: 18px; width: 18px; color: rgba(255,255,255,0.5); }
      strong { color: #4dd0e1; margin-left: 4px; }
    }
    .price-slider { flex: 1; }
    .slider-bounds { font-size: 0.75rem; color: rgba(255,255,255,0.4); white-space: nowrap; }

    .table-container { position: relative; overflow-x: auto; }
    .spinner-overlay {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.3); z-index: 10;
    }
    .market-table { width: 100%; }
    .fav-col { width: 48px; padding: 0 4px; }
    .fav-active mat-icon, .fav-active .mat-icon { color: #ffd740; }
    .item-name { font-weight: 500; }
    .type-id { color: rgba(255,255,255,0.4); font-size: 0.75rem; margin-left: 6px; }
    .good-deal { color: #4caf50; font-weight: 700; }
    .ok-deal { color: #ff9800; }
    .deal-row { background: rgba(76, 175, 80, 0.08); }
    .badge {
      padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;
    }
    .badge.sell { background: rgba(244,67,54,0.2); color: #ef9a9a; }
    .badge.buy { background: rgba(33,150,243,0.2); color: #90caf9; }
    .no-data { text-align: center; padding: 48px; color: rgba(255,255,255,0.4); }
    .jita { color: #ffd740; font-weight: 600; }
  `]
})
export class MarketTableComponent implements OnInit, OnDestroy {
  private marketService = inject(MarketService);
  private favouritesService = inject(FavouritesService);
  private fb = inject(FormBuilder);

  @ViewChild(MatSort) matSort!: MatSort;

  displayedColumns = ['favourite', 'typeName', 'systemName', 'price', 'averagePrice', 'discountPercent',
                      'volumeRemain', 'isBuyOrder', 'range', 'discoveredAt'];

  orders: MarketOffer[] = [];
  totalElements = 0;
  pageSize = 50;
  currentPage = 0;
  loading = false;
  sortBy = 'discountPercent';
  sortDir = 'desc';
  favouriteTypeIds = new Set<number>();
  private favSub!: Subscription;

  @Output() minAvgPriceMillionChange = new EventEmitter<number>();
  @Output() categoryNameChange = new EventEmitter<string | null>();

  categories: string[] = [];
  regions = [
    { id: 10000002, name: 'The Forge (Jita)' },
    { id: 10000043, name: 'Domain (Amarr)' },
    { id: 10000032, name: 'Sinq Laison (Dodixie)' },
    { id: 10000030, name: 'Heimatar (Rens)' },
    { id: 10000042, name: 'Metropolis (Hek)' },
  ];

  // Slider values are in millions of ISK; 1000 = 1B ISK (treated as "no max")
  filterForm = this.fb.group({
    typeNameSearch: [null as string | null],
    typeId: [null as number | null],
    regionId: [null as number | null],
    isBuyOrder: [null as boolean | null],
    goodDealsOnly: [false],
    minAvgPriceMillion: [100],
    maxAvgPriceMillion: [1000],
    categoryName: [null as string | null]
  });

  ngOnInit() {
    this.favouritesService.load();
    this.favSub = this.favouritesService.favourites$.subscribe(favs => {
      this.favouriteTypeIds = new Set(favs.map(f => f.typeId));
    });
    this.loadCategories();
    this.loadOrders();
  }

  ngOnDestroy() {
    this.favSub?.unsubscribe();
  }

  applyFilters() {
    this.currentPage = 0;
    const v = this.filterForm.value;
    this.minAvgPriceMillionChange.emit(v.minAvgPriceMillion ?? 0);
    this.categoryNameChange.emit(v.categoryName ?? null);
    this.loadOrders();
  }

  loadCategories() {
    this.marketService.getCategories().subscribe(cats => this.categories = cats);
  }

  loadOrders() {
    this.loading = true;
    const v = this.filterForm.value;
    const minMillions = v.minAvgPriceMillion ?? 0;
    const maxMillions = v.maxAvgPriceMillion ?? 1000;
    const filter: OrderFilter = {
      regionId: v.regionId ?? undefined,
      typeId: v.typeId ?? null,
      isBuyOrder: v.isBuyOrder ?? null,
      goodDealsOnly: v.goodDealsOnly ?? false,
      minAveragePrice: minMillions > 0 ? minMillions * 1_000_000 : null,
      maxAveragePrice: maxMillions < 1000 ? maxMillions * 1_000_000 : null,
      typeName: v.typeNameSearch ?? null,
      categoryName: v.categoryName ?? null,
      page: this.currentPage,
      size: this.pageSize,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    };

    this.marketService.getOrders(filter).subscribe({
      next: (page) => {
        this.orders = page.content;
        this.totalElements = page.page.totalElements;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onPageChange(event: PageEvent) {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadOrders();
  }

  onSortChange(sort: Sort) {
    this.sortBy = sort.active || 'discountPercent';
    this.sortDir = sort.direction || 'desc';
    this.currentPage = 0;
    this.loadOrders();
  }

  isFav(typeId: number): boolean {
    return this.favouriteTypeIds.has(typeId);
  }

  toggleFav(row: MarketOffer) {
    if (this.isFav(row.typeId)) {
      this.favouritesService.remove(row.typeId).subscribe();
    } else {
      this.favouritesService.add(row.typeId, row.typeName).subscribe();
    }
  }

  formatIsk(millions: number, isMax = false): string {
    if (isMax && millions >= 1000) return 'No limit';
    if (millions === 0) return 'No minimum';
    if (millions >= 1000) return `${(millions / 1000).toFixed(millions % 1000 === 0 ? 0 : 1)}B ISK`;
    return `${millions}M ISK`;
  }
}
