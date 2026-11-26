import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { apiErrorMessage } from '../core/api/api-error';
import { ScanApi } from '../core/api/scan-api.service';
import { ScanStatus, ScanSummary } from '../core/models/scan.models';
import { STATUS_PILL, formatDuration, scoreBand } from '../shared/format';

type Tab = 'ALL' | ScanStatus;
type Loaded = { scans: ScanSummary[]; error: null } | { scans: null; error: string };

@Component({
  selector: 'app-scan-history',
  imports: [RouterLink, DatePipe],
  templateUrl: './scan-history.html',
})
export class ScanHistory {
  private readonly loaded = toSignal(
    inject(ScanApi).list().pipe(
      map((scans): Loaded => ({ scans: [...scans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), error: null })),
      catchError((e) => of<Loaded>({ scans: null, error: apiErrorMessage(e) })),
    ),
  );
  protected readonly error = computed(() => this.loaded()?.error ?? null);
  protected readonly scans = computed(() => this.loaded()?.scans ?? null);
  protected readonly tab = signal<Tab>('ALL');
  protected readonly statusPill = STATUS_PILL;
  protected readonly band = scoreBand;

  protected readonly tabs = computed(() => {
    const all = this.scans() ?? [];
    const n = (s: ScanStatus) => all.filter((x) => x.status === s).length;
    return ([['ALL', 'All', all.length], ['COMPLETED', 'Completed', n('COMPLETED')], ['RUNNING', 'Running', n('RUNNING') + n('PENDING')], ['FAILED', 'Failed', n('FAILED')]] as [Tab, string, number][])
      .map(([id, label, count]) => ({ id, label, count }));
  });
  protected readonly rows = computed(() => (this.scans() ?? []).filter((s) => {
    const t = this.tab();
    return t === 'ALL' || s.status === t || (t === 'RUNNING' && s.status === 'PENDING');
  }));

  protected link(s: ScanSummary): unknown[] {
    return s.status === 'PENDING' || s.status === 'RUNNING' ? ['/scans', s.id, 'progress'] : ['/scans', s.id];
  }
  protected took(s: ScanSummary): string {
    return s.completedAt ? formatDuration(Date.parse(s.completedAt) - Date.parse(s.createdAt)) : '—';
  }
}
