import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { apiErrorMessage } from '../core/api/api-error';
import { ScanApi } from '../core/api/scan-api.service';
import { Category, LibraryTracker, TRACKING_CATEGORIES } from '../core/models/scan.models';

type Loaded = { trackers: LibraryTracker[]; error: null } | { trackers: null; error: string };
const CATEGORIES: Category[] = ['Analytics', 'Advertising', 'Social', 'Functional', 'Essential'];

/** Read-only view of the services the classifier knows (backend/src/classify/trackers.ts). */
@Component({
  selector: 'app-tracker-library',
  templateUrl: './tracker-library.html',
})
export class TrackerLibrary {
  private readonly loaded = toSignal(inject(ScanApi).trackers().pipe(
    map((trackers): Loaded => ({ trackers, error: null })),
    catchError((e) => of<Loaded>({ trackers: null, error: apiErrorMessage(e) })),
  ));
  protected readonly error = computed(() => this.loaded()?.error ?? null);
  protected readonly all = computed(() => this.loaded()?.trackers ?? null);

  protected readonly query = signal('');
  protected readonly category = signal<Category | 'All'>('All');
  protected readonly categories = CATEGORIES;
  protected readonly tracking = TRACKING_CATEGORIES;

  protected readonly counts = computed(() => {
    const all = this.all() ?? [];
    return Object.fromEntries(CATEGORIES.map((c) => [c, all.filter((t) => t.category === c).length])) as Record<Category, number>;
  });

  /** Matches the name, the provider or any domain, so "doubleclick.net" finds DoubleClick. */
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const c = this.category();
    return (this.all() ?? []).filter((t) =>
      (c === 'All' || t.category === c)
      && (!q || t.name.toLowerCase().includes(q) || t.provider.toLowerCase().includes(q) || t.domains.some((d) => d.includes(q))));
  });
}
