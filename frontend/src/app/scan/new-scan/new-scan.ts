import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { ScanApi } from '../../core/api/scan-api.service';
import { ConsentState, Viewport } from '../../core/models/scan.models';
import { checkUrl } from '../url-check';

type Mark = 'ok' | 'bad' | 'wait';

@Component({
  selector: 'app-new-scan',
  imports: [FormsModule, RouterLink],
  templateUrl: './new-scan.html',
})
export class NewScan implements OnInit {
  /** ?url= from "Scan again": the address to start with. */
  readonly prefill = input<string | undefined>(undefined, { alias: 'url' });

  private readonly api = inject(ScanApi);
  private readonly router = inject(Router);

  protected readonly url = signal('');
  protected readonly reject = signal(true);
  protected readonly accept = signal(true);
  protected readonly observation = signal(15);
  protected readonly viewport = signal<Viewport>('desktop');
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly check = computed(() => checkUrl(this.url()));
  protected readonly stateCount = computed(() => 1 + +this.reject() + +this.accept());
  /** Rough guide: per state, browser start and page load (~17 s) plus the watch time, plus classification. */
  protected readonly estimate = computed(() => {
    const secs = this.stateCount() * (this.observation() + 17) + 16;
    return `About ${Math.floor(secs / 60)} min ${secs % 60} s`;
  });

  protected readonly checks = computed(() => {
    const c = this.check();
    const ok = c.kind === 'ok';
    const mark = (m: Mark) => ({ cls: `mk-${m}`, state: { ok: 'passed', bad: 'failed', wait: 'not checked yet' }[m] });
    return [
      { title: 'http or https only', detail: ok ? `Will scan ${c.url}` : 'Other schemes such as file: or ftp: are refused.', ...mark(c.kind === 'empty' ? 'wait' : c.kind === 'scheme' ? 'bad' : 'ok') },
      { title: 'Public address', detail: 'Private, loopback and link-local ranges are refused. The server resolves the name and checks again.', ...mark(c.kind === 'private' ? 'bad' : ok ? 'ok' : 'wait') },
      { title: 'Not a metadata endpoint', detail: 'Cloud metadata addresses such as 169.254.169.254 are always refused.', ...mark(c.kind === 'metadata' ? 'bad' : ok ? 'ok' : 'wait') },
      { title: 'Every request re-checked', detail: 'Redirects and requests the page makes are checked again during the scan.', ...mark(ok ? 'ok' : 'wait') },
    ];
  });

  protected readonly viewports: { id: Viewport; label: string }[] = [
    { id: 'desktop', label: 'Desktop, 1366 × 768' },
    { id: 'phone', label: 'Phone, 390 × 844' },
  ];

  ngOnInit(): void {
    const u = this.prefill();
    if (u) this.url.set(u);
  }

  protected start(): void {
    const c = this.check();
    if (c.kind !== 'ok' || this.submitting()) return;
    const consentStates: ConsentState[] = ['BEFORE_INTERACTION'];
    if (this.reject()) consentStates.push('REJECTED');
    if (this.accept()) consentStates.push('ACCEPTED');

    this.submitting.set(true);
    this.serverError.set(null);
    this.api.create({ url: c.url, consentStates, observationSeconds: this.observation(), viewport: this.viewport() }).subscribe({
      next: (scan) => this.router.navigate(['/scans', scan.id, 'progress']),
      error: (err) => {
        this.serverError.set(apiErrorMessage(err));
        this.submitting.set(false);
      },
    });
  }
}
