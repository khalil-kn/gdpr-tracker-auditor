import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { apiErrorMessage } from '../core/api/api-error';
import { ScanApi } from '../core/api/scan-api.service';
import { ScanReport, ScanSummary } from '../core/models/scan.models';
import { ASSESSMENT_PILL } from '../scan-details/report.view';
import { SEVERITY_PILL, scoreBand } from '../shared/format';
import { Change, compareReports } from './compare.view';

type Pair = { before: ScanReport; after: ScanReport } | { error: string } | null;

/** Two completed scans side by side: /scans/compare?a=<older id>&b=<newer id>. */
@Component({
  selector: 'app-compare-scans',
  imports: [DatePipe, RouterLink],
  templateUrl: './compare.html',
})
export class CompareScans {
  /** From the query string, so a comparison can be bookmarked or shared. */
  readonly a = input<string>();
  readonly b = input<string>();

  private readonly api = inject(ScanApi);
  private readonly router = inject(Router);

  /** Completed scans, newest first: the only ones with something to compare. */
  protected readonly scans = toSignal(this.api.list().pipe(
    map((all) => all.filter((s) => s.status === 'COMPLETED').sort((x, y) => y.createdAt.localeCompare(x.createdAt))),
    catchError(() => of([] as ScanSummary[])),
  ));

  /** The newer scan: ?b=, else the latest completed one. */
  protected readonly afterId = computed(() => this.b() ?? this.scans()?.[0]?.id ?? null);
  /** The older scan: ?a=, else the previous scan of the same site. */
  protected readonly beforeId = computed(() => {
    if (this.a()) return this.a()!;
    const list = this.scans() ?? [];
    const after = list.find((s) => s.id === this.afterId());
    return after ? list.find((s) => s.host === after.host && s.createdAt < after.createdAt)?.id ?? null : null;
  });

  private readonly pair = toSignal(
    toObservable(computed(() => [this.beforeId(), this.afterId()] as const)).pipe(
      switchMap(([a, b]) => !a || !b ? of<Pair>(null) : forkJoin({ before: this.api.get(a), after: this.api.get(b) }).pipe(
        map((p): Pair => p),
        catchError((e) => of<Pair>({ error: apiErrorMessage(e) })),
      )),
    ),
    { initialValue: null },
  );
  protected readonly error = computed(() => { const p = this.pair(); return p && 'error' in p ? p.error : null; });
  protected readonly reports = computed(() => { const p = this.pair(); return p && 'before' in p ? p : null; });
  protected readonly cmp = computed(() => { const r = this.reports(); return r ? compareReports(r.before, r.after) : null; });

  protected readonly band = scoreBand;
  protected readonly severityPill = SEVERITY_PILL;
  protected readonly assessmentPill = ASSESSMENT_PILL;
  protected readonly changeLabel: Record<Change, { label: string; cls: string }> = {
    new: { label: 'New', cls: 'p-high' },
    gone: { label: 'Gone', cls: 'p-ok' },
    same: { label: 'Unchanged', cls: 'p-off' },
  };

  protected choose(which: 'a' | 'b', id: string): void {
    const queryParams = { a: this.beforeId(), b: this.afterId(), [which]: id };
    this.router.navigate([], { queryParams, replaceUrl: true });
  }

  protected delta(n: number | null): string {
    if (n === null) return '';
    return n === 0 ? 'no change' : n > 0 ? `${n} higher` : `${-n} lower`;
  }
}
