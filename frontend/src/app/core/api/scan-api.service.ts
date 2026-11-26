import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap, takeWhile, timer } from 'rxjs';
import { CreateScanRequest, LibraryTracker, ScanReport, ScanSummary } from '../models/scan.models';

@Injectable({ providedIn: 'root' })
export class ScanApi {
  private readonly http = inject(HttpClient);

  list(): Observable<ScanSummary[]> {
    return this.http.get<ScanSummary[]>('/api/scans');
  }

  /** The backend answers 202 Accepted with the PENDING scan; the scan runs in the worker. */
  create(body: CreateScanRequest): Observable<ScanSummary> {
    return this.http.post<ScanSummary>('/api/scans', body);
  }

  get(id: string): Observable<ScanReport> {
    return this.http.get<ScanReport>(`/api/scans/${encodeURIComponent(id)}`);
  }

  /** Address of the PDF version of a report. The browser downloads it with the session cookie. */
  pdfUrl(id: string): string {
    return `/api/scans/${encodeURIComponent(id)}/report.pdf`;
  }

  trackers(): Observable<LibraryTracker[]> {
    return this.http.get<LibraryTracker[]>('/api/trackers');
  }

  /** Polls until the scan is COMPLETED or FAILED, emitting every state including the last one. */
  watch(id: string, everyMs = 2000): Observable<ScanReport> {
    return timer(0, everyMs).pipe(
      switchMap(() => this.get(id)),
      takeWhile((s) => s.status === 'PENDING' || s.status === 'RUNNING', true),
    );
  }
}
