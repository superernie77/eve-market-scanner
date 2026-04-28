import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CapitalContractFilter, CapitalContractPage } from '../models/capital-contract.model';

const API_BASE = 'http://localhost:8080/api/contracts';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private http = inject(HttpClient);

  getCapitalContracts(filter: CapitalContractFilter): Observable<CapitalContractPage> {
    let params = new HttpParams()
      .set('page', filter.page ?? 0)
      .set('size', filter.size ?? 50)
      .set('priceCompleteOnly', filter.priceCompleteOnly ?? false);

    if (filter.regionId != null)     params = params.set('regionId',     filter.regionId);
    if (filter.capitalTypeId != null) params = params.set('capitalTypeId', filter.capitalTypeId);
    if (filter.maxPrice != null)      params = params.set('maxPrice',      filter.maxPrice);
    if (filter.sortBy != null)        params = params.set('sortBy',        filter.sortBy);
    if (filter.sortDir != null)       params = params.set('sortDir',       filter.sortDir);

    return this.http.get<CapitalContractPage>(`${API_BASE}/capitals`, { params });
  }

  triggerScan(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${API_BASE}/scan`, {});
  }
}
