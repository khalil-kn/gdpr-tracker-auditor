import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { USE_DEMO_API } from './app.config';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly demo = USE_DEMO_API;
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
