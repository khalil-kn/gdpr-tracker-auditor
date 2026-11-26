import { Component, computed, inject, signal } from '@angular/core';
import { STATE_SHORT, cookieLifetime } from '../../shared/format';
import { CookieRow, cookieRows, statesOf } from '../report.view';
import { ReportStore } from '../scan-details';

type Filter = 'all' | 'tracking' | 'essential' | 'weak';

@Component({
  selector: 'app-cookies',
  templateUrl: './cookies.html',
  styleUrl: './cookies.scss',
})
export class Cookies {
  private readonly store = inject(ReportStore);
  protected readonly report = computed(() => this.store.report()!);
  protected readonly stateShort = STATE_SHORT;
  protected readonly states = computed(() => statesOf(this.report()));
  protected readonly all = computed(() => cookieRows(this.report()));
  protected readonly filter = signal<Filter>('all');

  private readonly groups = computed<Record<Filter, CookieRow[]>>(() => {
    const all = this.all();
    return {
      all,
      tracking: all.filter((c) => c.tracking),
      essential: all.filter((c) => !c.tracking),
      weak: all.filter((c) => c.missingSecure || c.missingSameSite),
    };
  });
  protected readonly rows = computed(() => this.groups()[this.filter()]);
  protected readonly filters = computed(() =>
    ([['all', 'All'], ['tracking', 'Tracking'], ['essential', 'Not tracking'], ['weak', 'With weaknesses']] as [Filter, string][])
      .map(([id, label]) => ({ id, label, count: this.groups()[id].length })));

  protected lifetime(c: CookieRow): string {
    return cookieLifetime(c.expires, this.report().createdAt);
  }
}
