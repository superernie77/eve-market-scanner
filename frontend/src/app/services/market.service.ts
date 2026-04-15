import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ArbitrageFilter, ArbitrageOpportunity, CorpTransaction, MarketOffer, MarketStats, MyOrder, Page, WalletData } from '../models/market-offer.model';

const API_BASE = 'http://localhost:8080/api/market';

export interface OrderFilter {
  regionId?: number;
  typeId?: number | null;
  goodDealsOnly?: boolean;
  isBuyOrder?: boolean | null;
  minAveragePrice?: number | null;
  maxAveragePrice?: number | null;
  typeName?: string | null;
  categoryName?: string | null;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
}

@Injectable({ providedIn: 'root' })
export class MarketService {
  private http = inject(HttpClient);

  getOrders(filter: OrderFilter): Observable<Page<MarketOffer>> {
    let params = new HttpParams()
      .set('goodDealsOnly', filter.goodDealsOnly ?? false)
      .set('page', filter.page ?? 0)
      .set('size', filter.size ?? 50);

    if (filter.regionId != null) {
      params = params.set('regionId', filter.regionId);
    }
    if (filter.typeId != null) {
      params = params.set('typeId', filter.typeId);
    }
    if (filter.isBuyOrder != null) {
      params = params.set('isBuyOrder', filter.isBuyOrder);
    }
    if (filter.minAveragePrice != null) {
      params = params.set('minAveragePrice', filter.minAveragePrice);
    }
    if (filter.maxAveragePrice != null) {
      params = params.set('maxAveragePrice', filter.maxAveragePrice);
    }
    if (filter.typeName != null && filter.typeName.trim() !== '') {
      params = params.set('typeName', filter.typeName.trim());
    }
    if (filter.categoryName != null) {
      params = params.set('categoryName', filter.categoryName);
    }
    if (filter.sortBy != null) {
      params = params.set('sortBy', filter.sortBy);
    }
    if (filter.sortDir != null) {
      params = params.set('sortDir', filter.sortDir);
    }

    return this.http.get<Page<MarketOffer>>(`${API_BASE}/orders`, { params });
  }

  getTopDeals(regionId = 10000002, minAveragePrice?: number, categoryName?: string | null): Observable<MarketOffer[]> {
    let params = new HttpParams().set('regionId', regionId);
    if (minAveragePrice != null) params = params.set('minAveragePrice', minAveragePrice);
    if (categoryName != null) params = params.set('categoryName', categoryName);
    return this.http.get<MarketOffer[]>(`${API_BASE}/top-deals`, { params });
  }

  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${API_BASE}/categories`);
  }

  getStats(regionId = 10000002): Observable<MarketStats> {
    return this.http.get<MarketStats>(`${API_BASE}/stats`, {
      params: new HttpParams().set('regionId', regionId),
    });
  }

  triggerScan(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${API_BASE}/scan`, {});
  }

  getMyOrders(): Observable<MyOrder[]> {
    return this.http.get<MyOrder[]>(`${API_BASE}/my-orders`);
  }

  getMyBuyOrders(): Observable<MyOrder[]> {
    return this.http.get<MyOrder[]>(`${API_BASE}/my-buy-orders`);
  }

  getWallet(): Observable<WalletData> {
    return this.http.get<WalletData>('http://localhost:8080/api/wallet');
  }

  getCorpTransactions(): Observable<CorpTransaction[]> {
    return this.http.get<CorpTransaction[]>('http://localhost:8080/api/transactions/corp');
  }

  getArbitrageOpportunities(filter: ArbitrageFilter): Observable<ArbitrageOpportunity[]> {
    let params = new HttpParams();
    if (filter.minAveragePrice != null) params = params.set('minAveragePrice', filter.minAveragePrice);
    if (filter.maxAveragePrice != null) params = params.set('maxAveragePrice', filter.maxAveragePrice);
    if (filter.typeName != null && filter.typeName.trim() !== '') params = params.set('typeName', filter.typeName.trim());
    if (filter.categoryName != null)    params = params.set('categoryName', filter.categoryName);
    if (filter.minGapPercent != null)   params = params.set('minGapPercent', filter.minGapPercent);
    if (filter.limit != null)           params = params.set('limit', filter.limit);
    if (filter.typeIds != null && filter.typeIds.length > 0) params = params.set('typeIds', filter.typeIds.join(','));
    return this.http.get<ArbitrageOpportunity[]>(`${API_BASE}/arbitrage`, { params });
  }
}
