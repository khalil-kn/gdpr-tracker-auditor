import { ConsentState, ScanStatus, Severity } from '../core/models/scan.models';

export const STATE_LABEL: Record<ConsentState, string> = {
  BEFORE_INTERACTION: 'Before consent',
  REJECTED: 'After rejecting',
  ACCEPTED: 'After accepting',
};
export const STATE_SHORT: Record<ConsentState, string> = {
  BEFORE_INTERACTION: 'Before',
  REJECTED: 'Rejected',
  ACCEPTED: 'Accepted',
};

export const STATUS_PILL: Record<ScanStatus, { cls: string; label: string }> = {
  PENDING: { cls: 'p-run', label: 'Queued' },
  RUNNING: { cls: 'p-run', label: 'Running' },
  COMPLETED: { cls: 'p-ok', label: 'Completed' },
  FAILED: { cls: 'p-fail', label: 'Failed' },
};

export const SEVERITY_PILL: Record<Severity, { cls: string; label: string }> = {
  HIGH: { cls: 'p-high', label: 'High' },
  MEDIUM: { cls: 'p-med', label: 'Medium' },
  LOW: { cls: 'p-low', label: 'Low' },
};

/** Bands of the Privacy Exposure Score (higher = more exposed). */
export function scoreBand(score: number): { label: string; cls: string; color: string } {
  if (score >= 75) return { label: 'Severe', cls: 'c-bad', color: 'var(--high)' };
  if (score >= 50) return { label: 'High', cls: 'c-bad', color: 'var(--high)' };
  if (score >= 25) return { label: 'Moderate', cls: 'c-mod', color: 'var(--med)' };
  return { label: 'Low', cls: 'c-good', color: 'var(--ok)' };
}

/** Playwright's `expires` (unix seconds, -1 = session) as a human lifetime relative to the scan time. */
export function cookieLifetime(expires: number, scannedAtIso: string): string {
  if (expires < 0) return 'Session';
  const secs = expires - Date.parse(scannedAtIso) / 1000;
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h`;
  const days = Math.round(secs / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
