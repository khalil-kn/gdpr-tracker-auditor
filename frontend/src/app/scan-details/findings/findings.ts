import { Component, computed, inject, signal } from '@angular/core';
import { Finding } from '../../core/models/scan.models';
import { SEVERITY_PILL, STATE_LABEL } from '../../shared/format';
import { ReportStore } from '../scan-details';

const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

@Component({
  selector: 'app-findings',
  templateUrl: './findings.html',
  styleUrl: './findings.scss',
})
export class Findings {
  private readonly store = inject(ReportStore);
  protected readonly severity = SEVERITY_PILL;
  protected readonly stateLabel = STATE_LABEL;
  protected readonly list = computed(() =>
    [...this.store.report()!.findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]));
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed<Finding | null>(() => this.list().find((f) => f.id === this.selectedId()) ?? this.list()[0] ?? null);
}
