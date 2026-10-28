import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NewScan } from './new-scan';

describe('NewScan', () => {
  let component: NewScan;
  let fixture: ComponentFixture<NewScan>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewScan],
    }).compileComponents();

    fixture = TestBed.createComponent(NewScan);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
