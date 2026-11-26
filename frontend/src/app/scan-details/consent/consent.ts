import { Component, computed, inject, signal } from '@angular/core';
import { STATE_LABEL } from '../../shared/format';
import { lanes } from '../report.view';
import { ReportStore } from '../scan-details';

@Component({
  selector: 'app-consent',
  templateUrl: './consent.html',
})
export class Consent {
  private readonly store = inject(ReportStore);
  protected readonly report = computed(() => this.store.report()!);
  protected readonly stateLabel = STATE_LABEL;
  protected readonly showOther = signal(false);
  protected readonly lanes = computed(() => lanes(this.report()));
  protected readonly axis = computed(() => {
    const secs = this.report().observationSeconds;
    return [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => ({ x: f * 100, label: `${Math.round(f * secs)} s` }));
  });
  protected readonly runs = computed(() => new Map(this.report().states.map((s) => [s.consentState, s])));
}
