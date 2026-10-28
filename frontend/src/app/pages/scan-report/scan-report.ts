import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  imports: [],
  selector: 'app-scan-report',
  styleUrl: './scan-report.scss',
  templateUrl: './scan-report.html',
})
export class ScanReport {
  // Reads the :id part of the address /scans/:id
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
}
