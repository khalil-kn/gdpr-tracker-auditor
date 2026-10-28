import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ScanReport } from './scan-report';

describe('ScanReport', () => {
  let component: ScanReport;
  let fixture: ComponentFixture<ScanReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScanReport],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ScanReport);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
