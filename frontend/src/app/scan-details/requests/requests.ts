import { Component, computed, inject, signal } from '@angular/core';
import { ConsentState } from '../../core/models/scan.models';
import { STATE_LABEL, STATE_SHORT } from '../../shared/format';
import { DomainFilter, domainRows, statesOf } from '../report.view';
import { ReportStore } from '../scan-details';

@Component({
  selector: 'app-requests',
  templateUrl: './requests.html',
  styleUrl: './requests.scss',
})
export class Requests {
  private readonly store = inject(ReportStore);
  protected readonly report = computed(() => this.store.report()!);
  protected readonly stateShort = STATE_SHORT;

  protected readonly state = signal<ConsentState>('BEFORE_INTERACTION');
  protected readonly filter = signal<DomainFilter>('all');

  protected readonly states = computed(() => statesOf(this.report()).map((st) => ({
    id: st, count: this.report().requests.filter((q) => q.consentState === st).length,
  })));
  protected readonly filters = computed(() =>
    ([['all', 'All domains'], ['third', 'Third-party'], ['tracking', 'Trackers'], ['unknown', 'Unknown']] as [DomainFilter, string][])
      .map(([id, label]) => ({ id, label, count: domainRows(this.report(), this.state(), id).length })));
  protected readonly rows = computed(() => domainRows(this.report(), this.state(), this.filter()));
  protected readonly max = computed(() => Math.max(1, ...this.rows().map((r) => r.count)));
  protected readonly total = computed(() => this.rows().reduce((t, r) => t + r.count, 0));
  protected readonly shown = computed(() =>
    `${this.rows().length} ${this.rows().length === 1 ? 'domain' : 'domains'} ${STATE_LABEL[this.state()].toLowerCase()}, most requests first`);
}
