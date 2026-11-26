import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { AuthConfig, User } from '../models/scan.models';

/**
 * Who is signed in. The session itself is an HttpOnly cookie the page can't read,
 * so the only way to know is to ask the backend (GET /api/auth/me).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /** undefined = not asked yet, null = signed out. */
  readonly user = signal<User | null | undefined>(undefined);

  /** The current user, asking the backend only the first time. */
  ensure(): Observable<User | null> {
    const known = this.user();
    if (known !== undefined) return of(known);
    return this.http.get<User>('/api/auth/me').pipe(
      catchError(() => of(null)),
      tap((u) => this.user.set(u)),
    );
  }

  login(email: string, password: string): Observable<User> {
    return this.http.post<User>('/api/auth/login', { email, password }).pipe(tap((u) => this.user.set(u)));
  }

  register(email: string, password: string): Observable<User> {
    return this.http.post<User>('/api/auth/register', { email, password }).pipe(tap((u) => this.user.set(u)));
  }

  /** Deletes the session on the server too, not just the cookie. */
  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      catchError(() => of(undefined)),
      map(() => undefined),
      tap(() => this.user.set(null)),
    );
  }

  config(): Observable<AuthConfig> {
    return this.http.get<AuthConfig>('/api/auth/config').pipe(catchError(() => of({ registration: false, passwordMin: 10 })));
  }
}

/** Only same-site paths: "/scans/1" yes, "//evil.com" or "https://evil.com" no (open redirect). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
