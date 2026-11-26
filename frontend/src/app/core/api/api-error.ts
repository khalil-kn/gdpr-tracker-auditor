import { HttpErrorResponse } from '@angular/common/http';

/** The backend sends `{ message }` on 4xx; anything else becomes a generic, safe sentence. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'The scanner API cannot be reached. Is the backend running?';
    const msg = (err.error as { message?: unknown } | null)?.message;
    if (err.status < 500 && typeof msg === 'string') return msg;
    if (err.status === 404) return 'This scan does not exist.';
    if (err.status === 429) return 'Too many scans in a short time. Wait a minute and try again.';
  }
  return 'Something went wrong on the server. Try again in a moment.';
}
