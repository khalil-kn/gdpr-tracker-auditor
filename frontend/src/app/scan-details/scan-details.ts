import { Component, DestroyRef, Injectable, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { switchMap } from 'rxjs';
import { apiErrorMessage } from '../core/api/api-error';
import { ScanApi } from '../core/api/scan-api.service';
import { ScanReport } from '../core/models/scan.models';
import { serviceRows, cookieRows } from './report.view';

/** Holds the loaded report for the tab components below; provided per ScanDetails instance. */
@Injectable()
export class ReportStore {
  readonly report = signal<ScanReport | null>(null);
}

@Component({
  selector: 'app-scan-details',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe],
  providers: [ReportStore],
  templateUrl: './scan-details.html',
})
export class ScanDetails {
  readonly id = input.required<string>();

  private readonly api = inject(ScanApi);
  private readonly router = inject(Router);
  protected readonly store = inject(ReportStore);
  protected readonly error = signal<string | null>(null);
  protected readonly pdfUrl = computed(() => this.api.pdfUrl(this.id()));

  protected readonly tabs = computed(() => {
    const r = this.store.report();
    if (!r) return [];
    return [
      { path: '.', label: 'Summary', count: null, exact: true },
      { path: 'trackers', label: 'Trackers', count: serviceRows(r).filter((s) => s.tracking).length, exact: false },
      { path: 'consent', label: 'Consent', count: null, exact: false },
      { path: 'cookies', label: 'Cookies', count: cookieRows(r).length, exact: false },
      { path: 'requests', label: 'Requests', count: r.requests.length, exact: false },
      { path: 'findings', label: 'Findings', count: r.findings.length, exact: false },
    ];
  });

  constructor() {
    toObservable(this.id)
      .pipe(switchMap((id) => this.api.get(id)), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe({
        next: (r) => {
          if (r.status === 'PENDING' || r.status === 'RUNNING') {
            this.router.navigate(['/scans', r.id, 'progress'], { replaceUrl: true });
            return;
          }
          this.store.report.set(r);
        },
        error: (e) => this.error.set(apiErrorMessage(e)),
      });
  }
}
