import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Category, ConsentState } from '../../core/models/scan.models';
import { STATE_LABEL, STATE_SHORT } from '../../shared/format';
import { ASSESSMENT_PILL, ServiceRow, serviceRows, statesOf } from '../report.view';
import { ReportStore } from '../scan-details';

const COLOR: Record<Category, string> = {
  Analytics: 'var(--an)', Advertising: 'var(--ad)', Social: 'var(--so)',
  Functional: 'var(--fn)', Essential: 'var(--es)', Unknown: 'var(--uk)',
};

@Component({
  selector: 'app-trackers',
  imports: [RouterLink],
  templateUrl: './trackers.html',
  styleUrl: './trackers.scss',
})
export class Trackers {
  private readonly store = inject(ReportStore);
  protected readonly report = computed(() => this.store.report()!);

  protected readonly stateShort = STATE_SHORT;
  protected readonly assessmentPill = ASSESSMENT_PILL;
  protected readonly states = computed(() => statesOf(this.report()));
  protected readonly all = computed(() => serviceRows(this.report()));

  protected readonly state = signal<ConsentState>('BEFORE_INTERACTION');
  protected readonly onlyTracking = signal(false);
  protected readonly selectedKey = signal<string | null>(null);

  protected readonly rows = computed(() => this.all().filter((s) => !this.onlyTracking() || s.tracking));
  protected readonly selected = computed<ServiceRow | null>(() => this.all().find((s) => s.key === this.selectedKey()) ?? this.all()[0] ?? null);
  protected readonly totals = computed(() =>
    this.states().map((st) => this.rows().reduce((t, s) => t + s.counts[st], 0)));

  /** Third-party map: inner ring = present before any choice, outer ring = only appears later. Dot size = request count. */
  protected readonly nodes = computed(() => {
    const st = this.state();
    const inner = this.all().filter((s) => s.counts.BEFORE_INTERACTION > 0);
    const outer = this.all().filter((s) => s.counts.BEFORE_INTERACTION === 0);
    const place = (list: ServiceRow[], r: number, start: number) =>
      list.map((s, i) => ({ s, r, a: start + (i * 2 * Math.PI) / Math.max(1, list.length) }));
    return [...place(inner, 25, -Math.PI / 2), ...place(outer, 40, -Math.PI / 4)].map(({ s, r, a }) => {
      const n = s.counts[st];
      return {
        key: s.key,
        label: s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name,
        x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a),
        len: r - 11, deg: (a * 180) / Math.PI,
        size: n > 0 ? Math.round(10 + 7 * Math.sqrt(n)) : 12,
        on: n > 0, color: COLOR[s.category],
        flag: n > 0 && s.tracking && st !== 'ACCEPTED',
        aria: `${s.name}, ${s.category}, ${n} ${n === 1 ? 'request' : 'requests'}`,
      };
    });
  });
  protected readonly liveCount = computed(() => this.all().reduce((t, s) => t + s.counts[this.state()], 0));
  protected readonly stateLine = computed(() => {
    const live = this.all().filter((s) => s.counts[this.state()] > 0);
    return `${live.length} services ${STATE_LABEL[this.state()].toLowerCase()}, ${live.filter((s) => s.tracking).length} of them tracking.`;
  });

  protected firstSeen(ms: number | null): string {
    return ms === null ? '—' : `${(ms / 1000).toFixed(1)} s after the page started loading`;
  }
}
