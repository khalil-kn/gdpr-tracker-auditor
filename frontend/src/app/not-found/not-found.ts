import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="panel">
      <div class="empty" style="padding: 48px 32px">
        <h1 class="t-title">This page doesn't exist</h1>
        <p class="muted" style="max-width: 60ch">The address may be mistyped, or the page was moved. Your scans are under Scans.</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <a class="btn btn-primary" routerLink="/">Go to the overview</a>
          <a class="btn btn-outline" routerLink="/scans">See all scans</a>
        </div>
      </div>
    </section>
  `,
})
export class NotFound {}
