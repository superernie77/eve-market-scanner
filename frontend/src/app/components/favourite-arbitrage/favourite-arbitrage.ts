import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MarketService } from '../../services/market.service';
import { FavouritesService } from '../../services/favourites.service';
import { ArbitrageOpportunity, Favourite } from '../../models/market-offer.model';

@Component({
  selector: 'app-favourite-arbitrage',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatSortModule, MatProgressSpinnerModule,
    MatIconModule, MatButtonModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule
  ],
  template: `
    <div class="header-bar">
      <div class="title-area">
        <mat-icon>star</mat-icon>
        <span>Favourite Item Arbitrage</span>
        <span class="count" *ngIf="!loading">({{ dataSource.data.length }} opportunities)</span>
      </div>

      <div class="controls">
        <mat-form-field appearance="outline" class="gap-field">
          <mat-label>Min Gap %</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="minGapPercent" (keyup.enter)="load()">
        </mat-form-field>
        <button mat-flat-button color="primary" (click)="load()" class="apply-btn">
          <mat-icon>search</mat-icon> Apply
        </button>
      </div>

      <div class="auth-area">
        <button mat-stroked-button (click)="load()" class="refresh-btn">
          <mat-icon>refresh</mat-icon> Refresh
        </button>
      </div>
    </div>

    <div class="spinner-wrap" *ngIf="loading">
      <mat-spinner diameter="48"></mat-spinner>
    </div>

    <div class="empty-state" *ngIf="!loading && favourites.length === 0">
      <mat-icon>star_border</mat-icon>
      <p>No favourites yet. Star items on the All Orders tab to add them here.</p>
    </div>

    <div class="empty-state" *ngIf="!loading && favourites.length > 0 && dataSource.data.length === 0">
      <mat-icon>swap_horiz</mat-icon>
      <p>No arbitrage opportunities found for your {{ favourites.length }} favourite item(s).</p>
    </div>

    <div class="fav-chips" *ngIf="favourites.length > 0">
      <span class="fav-label">Watching:</span>
      <span *ngFor="let fav of favourites" class="fav-chip">
        {{ fav.typeName }}
        <button mat-icon-button class="remove-btn" [matTooltip]="'Remove ' + fav.typeName" (click)="removeFav(fav)">
          <mat-icon>close</mat-icon>
        </button>
      </span>
    </div>

    <div class="table-container" *ngIf="!loading && dataSource.data.length > 0">
      <table mat-table [dataSource]="dataSource" matSort class="arb-table">

        <ng-container matColumnDef="typeName">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="typeName">Item</th>
          <td mat-cell *matCellDef="let row">
            <span class="item-name">{{ row.typeName }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="buyRegionName">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="buyRegionName">Buy In</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'region r' + row.buyRegionId">{{ row.buyRegionName }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="buyPrice">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="buyPrice">Buy Price (ISK)</th>
          <td mat-cell *matCellDef="let row" class="num">{{ row.buyPrice | number:'1.2-2' }}</td>
        </ng-container>

        <ng-container matColumnDef="sellRegionName">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="sellRegionName">Sell In</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="'region r' + row.sellRegionId">{{ row.sellRegionName }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="sellPrice">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="sellPrice">Sell Price (ISK)</th>
          <td mat-cell *matCellDef="let row" class="num">{{ row.sellPrice | number:'1.2-2' }}</td>
        </ng-container>

        <ng-container matColumnDef="gapPercent">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="gapPercent">Gap</th>
          <td mat-cell *matCellDef="let row">
            <span [class]="gapClass(row.gapPercent)">+{{ row.gapPercent | number:'1.1-1' }}%</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="volumeAvailable">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="volumeAvailable">Volume</th>
          <td mat-cell *matCellDef="let row" class="num" matTooltip="Units available at buy region">{{ row.volumeAvailable | number }}</td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            [class.high-gap]="row.gapPercent >= 50"></tr>
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
    .controls { display: flex; align-items: center; gap: 8px; }
    .gap-field { width: 110px; }
    .apply-btn { height: 40px; align-self: center; }
    .auth-area { display: flex; align-items: center; gap: 8px; }
    .refresh-btn { font-size: 0.8rem; }

    .fav-chips {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      margin-bottom: 16px; padding: 10px 12px;
      background: rgba(255,215,64,0.06);
      border: 1px solid rgba(255,215,64,0.2);
      border-radius: 8px;
    }
    .fav-label { font-size: 0.75rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.06em; margin-right: 4px; }
    .fav-chip {
      display: flex; align-items: center; gap: 2px;
      background: rgba(255,215,64,0.12); color: #ffd740;
      font-size: 0.8rem; padding: 3px 8px 3px 10px; border-radius: 16px;
    }
    .remove-btn { width: 20px; height: 20px; line-height: 20px; }
    .remove-btn mat-icon, .remove-btn .mat-icon { font-size: 14px; height: 14px; width: 14px; color: rgba(255,215,64,0.6); }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 64px 24px;
      color: rgba(255,255,255,0.3); gap: 12px;
      mat-icon { font-size: 48px; height: 48px; width: 48px; }
      p { margin: 0; font-size: 0.95rem; text-align: center; }
    }
    .spinner-wrap { display: flex; justify-content: center; padding: 48px; }

    .table-container { overflow-x: auto; }
    .arb-table { width: 100%; }

    .item-name { font-weight: 500; }
    .num { font-variant-numeric: tabular-nums; }

    .region {
      font-weight: 600; padding: 2px 10px;
      border-radius: 4px; font-size: 0.8rem; white-space: nowrap;
    }
    .r10000002 { background: rgba(255,215,64,0.15);  color: #ffd740; }
    .r10000043 { background: rgba(239,154,154,0.15); color: #ef9a9a; }
    .r10000032 { background: rgba(144,202,249,0.15); color: #90caf9; }
    .r10000030 { background: rgba(165,214,167,0.15); color: #a5d6a7; }
    .r10000042 { background: rgba(206,147,216,0.15); color: #ce93d8; }

    .gap-ok    { color: #ff9800; font-weight: 600; }
    .gap-good  { color: #4caf50; font-weight: 700; }
    .gap-great { color: #69f0ae; font-weight: 700; font-size: 1.05em; }

    .high-gap { background: rgba(105,240,174,0.05); }
    .no-data { text-align: center; padding: 48px; color: rgba(255,255,255,0.4); }
  `]
})
export class FavouriteArbitrageComponent implements OnInit {
  private marketService = inject(MarketService);
  private favouritesService = inject(FavouritesService);

  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) {
      this.dataSource.sort = sort;
      this.dataSource.sortingDataAccessor = (row, id) => (row as any)[id] ?? 0;
      // Defer initial sort to avoid ExpressionChangedAfterItHasBeenCheckedError
      Promise.resolve().then(() => sort.sort({ id: 'buyRegionName', start: 'desc', disableClear: false }));
    }
  }

  displayedColumns = ['typeName', 'buyRegionName', 'buyPrice', 'sellRegionName', 'sellPrice', 'gapPercent', 'volumeAvailable'];
  dataSource = new MatTableDataSource<ArbitrageOpportunity>([]);
  favourites: Favourite[] = [];
  loading = false;
  minGapPercent = 35;

  ngOnInit() {
    this.favouritesService.favourites$.subscribe(favs => {
      this.favourites = favs;
      if (favs.length > 0) this.load();
      else this.dataSource.data = [];
    });
  }

  load() {
    if (this.favourites.length === 0) return;
    this.loading = true;
    const typeIds = this.favourites.map(f => f.typeId);
    this.marketService.getArbitrageOpportunities({ typeIds, minGapPercent: this.minGapPercent, limit: 10000 }).subscribe({
      next: (data) => {
        this.dataSource.data = data.filter(o => !o.alreadyListed);
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  removeFav(fav: Favourite) {
    this.favouritesService.remove(fav.typeId).subscribe();
  }

  gapClass(gap: number): string {
    if (gap >= 100) return 'gap-great';
    if (gap >= 20)  return 'gap-good';
    return 'gap-ok';
  }
}
