import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SEVERITY_PILL, STATE_LABEL, STATE_SHORT, scoreBand } from '../../shared/format';
import { categoryMix, stateTotals, statesOf } from '../report.view';
import { ReportStore } from '../scan-details';

const CIRC = 2 * Math.PI * 80;

@Component({
  selector: 'app-overview',
  imports: [RouterLink],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class Overview {
  private readonly store = inject(ReportStore);
  protected readonly report = computed(() => this.store.report()!);

  protected readonly stateShort = STATE_SHORT;
  protected readonly stateLabel = STATE_LABEL;
  protected readonly severity = SEVERITY_PILL;
  protected readonly totals = computed(() => stateTotals(this.report()));
  protected readonly domainTrend = computed(() => this.totals().map((t) => t.thirdPartyDomains).join(', then '));
  protected readonly band = computed(() => scoreBand(this.report().privacyScore?.value ?? 0));

  /** The score ring: one arc per breakdown entry, each as long as its points, with a small gap between. */
  protected readonly arcs = computed(() => {
    let offset = 0;
    return (this.report().privacyScore?.breakdown ?? []).map((b) => {
      const len = (b.points / 100) * CIRC;
      const arc = { dash: `${Math.max(0, len - 3)} ${CIRC}`, offset: -offset };
      offset += len;
      return arc;
    });
  });

  /** The richest state (accepted if it ran) shows the full third-party picture. */
  protected readonly mixState = computed(() => statesOf(this.report()).at(-1)!);
  protected readonly mix = computed(() => categoryMix(this.report(), this.mixState()));
  protected readonly mixTotal = computed(() => this.mix().reduce((t, m) => t + m.count, 0));

  protected readonly topFindings = computed(() => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...this.report().findings].sort((a, b) => order[a.severity] - order[b.severity]);
  });
}
