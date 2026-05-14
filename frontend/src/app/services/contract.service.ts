import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CapitalContractFilter, CapitalContractPage, CapitalTypeOption, ContractDealFilter } from '../models/capital-contract.model';

const API_BASE = 'http://localhost:8080/api/contracts';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private http = inject(HttpClient);

  getCapitalContracts(filter: CapitalContractFilter): Observable<CapitalContractPage> {
    let params = new HttpParams()
      .set('page', filter.page ?? 0)
      .set('size', filter.size ?? 50)
      .set('priceCompleteOnly', filter.priceCompleteOnly ?? false)
      .set('noFittings', filter.noFittings ?? false);

    if (filter.regionId != null)        params = params.set('regionId',        filter.regionId);
    if (filter.capitalTypeId != null)   params = params.set('capitalTypeId',   filter.capitalTypeId);
    if (filter.capitalGroupName != null) params = params.set('capitalGroupName', filter.capitalGroupName);
    if (filter.maxPrice != null)        params = params.set('maxPrice',        filter.maxPrice);
    if (filter.sortBy != null)        params = params.set('sortBy',        filter.sortBy);
    if (filter.sortDir != null)       params = params.set('sortDir',       filter.sortDir);

    return this.http.get<CapitalContractPage>(`${API_BASE}/capitals`, { params });
  }

  getContractDeals(filter: ContractDealFilter): Observable<CapitalContractPage> {
    let params = new HttpParams()
      .set('page',    filter.page    ?? 0)
      .set('size',    filter.size    ?? 50)
      .set('minPctDiff', filter.minPctDiff ?? 0);
    if (filter.regionId        != null) params = params.set('regionId',        filter.regionId);
    if (filter.minContractValue != null) params = params.set('minContractValue', filter.minContractValue);
    if (filter.minAbsDiff      != null) params = params.set('minAbsDiff',      filter.minAbsDiff);
    if (filter.sortBy          != null) params = params.set('sortBy',          filter.sortBy);
    if (filter.sortDir         != null) params = params.set('sortDir',         filter.sortDir);
    return this.http.get<CapitalContractPage>(`${API_BASE}/deals`, { params });
  }

  getCapitalNames(): Observable<CapitalTypeOption[]> {
    return this.http.get<CapitalTypeOption[]>(`${API_BASE}/capital-names`);
  }

  triggerScan(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${API_BASE}/scan`, {});
  }
}
