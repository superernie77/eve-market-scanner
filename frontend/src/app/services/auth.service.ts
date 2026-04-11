import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AuthStatus {
  loggedIn: boolean;
  characterName: string | null;
}

const AUTH_BASE = 'http://localhost:8080/api/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  getStatus(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>(`${AUTH_BASE}/status`);
  }

  login(): void {
    window.location.href = `${AUTH_BASE}/login`;
  }

  logout(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${AUTH_BASE}/logout`, {});
  }
}
