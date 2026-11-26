import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../core/api/api-error';
import { AuthService, safeNext } from '../core/auth/auth.service';

/** Sign in and create account: one form, two modes, chosen by the route's data. */
@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
})
export class AuthPage {
  /** From the route's data. */
  readonly mode = input<'login' | 'register'>('login');
  /** From ?next= : where to go after signing in. */
  readonly next = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly config = toSignal(this.auth.config());

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly isRegister = computed(() => this.mode() === 'register');
  protected readonly min = computed(() => this.config()?.passwordMin ?? 10);
  protected readonly tooShort = computed(() => this.isRegister() && this.password().length > 0 && this.password().length < this.min());
  protected readonly canSubmit = computed(() =>
    !this.busy() && this.email().trim().length > 0 && this.password().length > 0 && !this.tooShort());

  protected submit(): void {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    const call = this.isRegister()
      ? this.auth.register(this.email(), this.password())
      : this.auth.login(this.email(), this.password());
    call.subscribe({
      next: () => this.router.navigateByUrl(safeNext(this.next())),
      error: (err) => {
        this.error.set(apiErrorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
