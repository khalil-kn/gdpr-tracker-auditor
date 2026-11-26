import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { apiErrorMessage } from '../core/api/api-error';
import { ScanApi } from '../core/api/scan-api.service';
import { ScanSummary } from '../core/models/scan.models';
import { STATUS_PILL, scoreBand } from '../shared/format';

type Loaded = { scans: ScanSummary[]; error: null } | { scans: null; error: string };

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly loaded = toSignal(
    inject(ScanApi).list().pipe(
      map((scans): Loaded => ({ scans, error: null })),
      catchError((e) => of<Loaded>({ scans: null, error: apiErrorMessage(e) })),
    ),
  );
  protected readonly error = computed(() => this.loaded()?.error ?? null);
  protected readonly scans = computed(() => this.loaded()?.scans ?? null);
  protected readonly statusPill = STATUS_PILL;
  protected readonly band = scoreBand;

  /** Latest scan per site, newest first. */
  protected readonly sites = computed(() => {
    const latest = new Map<string, ScanSummary>();
    for (const s of [...(this.scans() ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      if (!latest.has(s.host)) latest.set(s.host, s);
    }
    return [...latest.values()];
  });

  /** The completed site with the highest exposure gets the hero panel. */
  protected readonly worst = computed(() =>
    this.sites().filter((s) => s.status === 'COMPLETED' && s.score !== null).sort((a, b) => b.score! - a.score!)[0] ?? null);

  protected readonly kpis = computed(() => {
    const all = this.scans() ?? [];
    const sites = this.sites();
    return {
      sites: sites.length,
      scans: all.length,
      completed: all.filter((s) => s.status === 'COMPLETED').length,
      running: all.filter((s) => s.status === 'RUNNING' || s.status === 'PENDING').length,
      failed: all.filter((s) => s.status === 'FAILED').length,
      findings: sites.reduce((t, s) => t + (s.findingCount ?? 0), 0),
    };
  });

  protected link(s: ScanSummary): unknown[] {
    return s.status === 'PENDING' || s.status === 'RUNNING' ? ['/scans', s.id, 'progress'] : ['/scans', s.id];
  }
}
