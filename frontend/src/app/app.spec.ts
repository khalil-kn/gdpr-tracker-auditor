import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows only the logo while signed out', async () => {
    TestBed.inject(AuthService).user.set(null);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');
    expect(nav?.querySelector('[aria-label="New scan"]')).toBeNull();
    expect(nav?.querySelector('.rail-out')).toBeNull();
  });

  it('renders the navigation rail and sign-out once signed in', async () => {
    TestBed.inject(AuthService).user.set({ id: 'u1', email: 'alice@example.com' });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Main navigation');
    expect(nav?.querySelector('[aria-label="New scan"]')?.getAttribute('href')).toBe('/scans/new');
    expect(nav?.querySelector('[aria-label="Overview"]')?.getAttribute('href')).toBe('/');
    expect(nav?.querySelector('[aria-label="Tracker library"]')?.getAttribute('href')).toBe('/library');
    expect(nav?.querySelector('.rail-out')?.getAttribute('aria-label')).toBe('Sign out alice@example.com');
  });
});
