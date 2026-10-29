import { Routes } from '@angular/router';
import { NewScan } from './pages/new-scan/new-scan';
import { Overview } from './pages/overview/overview';
import { ScanReport } from './pages/scan-report/scan-report';

export const routes: Routes = [
  { path: '', component: Overview, title: 'Overview · Tracker Auditor' },
  { path: 'scans/new', component: NewScan, title: 'New scan · Tracker Auditor' },
  { path: 'scans/:id', component: ScanReport, title: 'Scan report · Tracker Auditor' },
  { path: '**', redirectTo: '' },
];
