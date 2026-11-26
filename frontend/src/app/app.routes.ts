import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  // Signed-out pages
  { path: 'login', title: 'Sign in · Tracker Auditor', canActivate: [guestGuard], data: { mode: 'login' }, loadComponent: () => import('./auth/auth-page').then((m) => m.AuthPage) },
  { path: 'register', title: 'Create account · Tracker Auditor', canActivate: [guestGuard], data: { mode: 'register' }, loadComponent: () => import('./auth/auth-page').then((m) => m.AuthPage) },

  // Everything else needs a signed-in user. The guard runs once for all children.
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', title: 'Overview · Tracker Auditor', loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'scans', title: 'Scans · Tracker Auditor', loadComponent: () => import('./reports/scan-history').then((m) => m.ScanHistory) },
      { path: 'scans/new', title: 'New scan · Tracker Auditor', loadComponent: () => import('./scan/new-scan/new-scan').then((m) => m.NewScan) },
      { path: 'scans/compare', title: 'Compare scans · Tracker Auditor', loadComponent: () => import('./reports/compare').then((m) => m.CompareScans) },
      { path: 'scans/:id/progress', title: 'Scan in progress · Tracker Auditor', loadComponent: () => import('./scan/scan-progress/scan-progress').then((m) => m.ScanProgress) },
      {
        path: 'scans/:id',
        title: 'Scan report · Tracker Auditor',
        loadComponent: () => import('./scan-details/scan-details').then((m) => m.ScanDetails),
        children: [
          { path: '', loadComponent: () => import('./scan-details/overview/overview').then((m) => m.Overview) },
          { path: 'trackers', loadComponent: () => import('./scan-details/trackers/trackers').then((m) => m.Trackers) },
          { path: 'consent', loadComponent: () => import('./scan-details/consent/consent').then((m) => m.Consent) },
          { path: 'cookies', loadComponent: () => import('./scan-details/cookies/cookies').then((m) => m.Cookies) },
          { path: 'requests', loadComponent: () => import('./scan-details/requests/requests').then((m) => m.Requests) },
          { path: 'findings', loadComponent: () => import('./scan-details/findings/findings').then((m) => m.Findings) },
        ],
      },
      { path: 'library', title: 'Tracker library · Tracker Auditor', loadComponent: () => import('./library/tracker-library').then((m) => m.TrackerLibrary) },
      { path: '**', title: 'Page not found · Tracker Auditor', loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound) },
    ],
  },
];
