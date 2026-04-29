import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export interface AuthStatus {
  loggedIn: boolean;
  characterName: string | null;
  hasWalletScope: boolean;
  hasCorpWalletScope: boolean;
}

const DEFAULT_STATUS: AuthStatus = { loggedIn: false, characterName: null, hasWalletScope: false, hasCorpWalletScope: false };
const AUTH_BASE = 'http://localhost:8080/api/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private _status = new BehaviorSubject<AuthStatus>(DEFAULT_STATUS);
  /** All components subscribe here — no individual HTTP calls needed. */
  status$ = this._status.asObservable();

  /** Fetch current auth state from the backend and broadcast to all subscribers. */
  refresh(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>(`${AUTH_BASE}/status`).pipe(
      tap(s => this._status.next(s))
    );
  }

  login(): void {
    window.location.href = `${AUTH_BASE}/login`;
  }

  logout(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${AUTH_BASE}/logout`, {}).pipe(
      tap(() => this._status.next(DEFAULT_STATUS))
    );
  }
}
