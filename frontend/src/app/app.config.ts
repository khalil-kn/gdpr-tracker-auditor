import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { demoApiInterceptor } from './core/api/demo-api.interceptor';

/** Serve sample data instead of calling Express, for working on the UI without the backend. Dev builds only. */
export const USE_DEMO_API = isDevMode() && false;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors(USE_DEMO_API ? [demoApiInterceptor] : [])),
  ],
};
