import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { interval, switchMap } from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-error';
import { ScanApi } from '../../core/api/scan-api.service';
import { ScanSummary } from '../../core/models/scan.models';
import { STATE_LABEL, STATUS_PILL, formatDuration } from '../../shared/format';

@Component({
  selector: 'app-scan-progress',
  imports: [RouterLink],
  templateUrl: './scan-progress.html',
})
export class ScanProgress {
  /** Route parameter, bound by withComponentInputBinding(). */
  readonly id = input.required<string>();

  private readonly api = inject(ScanApi);
  protected readonly scan = signal<ScanSummary | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly now = signal(Date.now());

  protected readonly stateLabel = STATE_LABEL;
  protected readonly statusPill = STATUS_PILL;

  protected readonly elapsed = computed(() => {
    const s = this.scan();
    if (!s) return '0:00';
    const end = s.completedAt ? Date.parse(s.completedAt) : this.now();
    return formatDuration(end - Date.parse(s.createdAt));
  });
  protected readonly expected = computed(() => {
    const s = this.scan();
    return s ? formatDuration((s.consentStates.length * (s.observationSeconds + 17) + 16) * 1000) : '';
  });
  protected readonly finished = computed(() => this.scan()?.status === 'COMPLETED' || this.scan()?.status === 'FAILED');

  constructor() {
    const destroy = inject(DestroyRef);
    toObservable(this.id)
      .pipe(switchMap((id) => this.api.watch(id)), takeUntilDestroyed(destroy))
      .subscribe({ next: (s) => this.scan.set(s), error: (e) => this.error.set(apiErrorMessage(e)) });
    interval(1000).pipe(takeUntilDestroyed(destroy)).subscribe(() => this.now.set(Date.now()));
  }
}
