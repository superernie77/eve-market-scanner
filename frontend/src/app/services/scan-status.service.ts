import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer, switchMap, shareReplay } from 'rxjs';

export interface RegionStatus {
  regionId: number;
  regionName: string;
  lastScanAt: string | null;
  fresh: boolean;
  active: boolean;
}

export interface ScanGroupStatus {
  scanning: boolean;
  currentRegionId: number | null;
  regions: RegionStatus[];
}

export interface ScanStatus {
  market: ScanGroupStatus;
  contracts: ScanGroupStatus;
}

@Injectable({ providedIn: 'root' })
export class ScanStatusService {
  private http = inject(HttpClient);

  readonly status$: Observable<ScanStatus> = timer(0, 5000).pipe(
    switchMap(() => this.http.get<ScanStatus>('http://localhost:8080/api/status')),
    shareReplay(1)
  );
}
