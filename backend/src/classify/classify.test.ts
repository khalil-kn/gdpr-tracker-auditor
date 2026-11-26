import { describe, expect, it } from 'vitest';
import { classifyCookie, matchTracker, registrableDomain } from './classify.ts';

describe('registrableDomain', () => {
  it.each([
    ['shop.example.co.uk', 'example.co.uk'],
    ['cdn.example.co.uk', 'example.co.uk'],
    ['www.example.com', 'example.com'],
    ['alice.github.io', 'alice.github.io'], // github.io is a public suffix: different owners
    ['.example.com', 'example.com'], // cookie domains start with a dot
    ['127.0.0.1', '127.0.0.1'],
  ])('%s -> %s', (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });
});

describe('matchTracker', () => {
  it('matches the domain and its subdomains, not look-alikes', () => {
    expect(matchTracker('region1.google-analytics.com')?.id).toBe('ga4');
    expect(matchTracker('google-analytics.com')?.id).toBe('ga4');
    expect(matchTracker('evilgoogle-analytics.com')).toBeUndefined();
    expect(matchTracker('bat.bing.com')?.id).toBe('microsoft-ads');
    expect(matchTracker('www.bing.com')).toBeUndefined();
  });
});

describe('classifyCookie', () => {
  it('recognises first-party tracking cookies by name', () => {
    expect(classifyCookie('_ga', '.shop.example')).toEqual({ category: 'Analytics', trackerId: 'ga4' });
    expect(classifyCookie('_ga_R7K2M9', '.shop.example').trackerId).toBe('ga4');
    expect(classifyCookie('_fbp', '.shop.example').category).toBe('Social');
  });
  it('uses the cookie domain for third-party cookies', () => {
    expect(classifyCookie('IDE', '.doubleclick.net')).toEqual({ category: 'Advertising', trackerId: 'doubleclick' });
  });
  it('labels consent records Essential and everything else Unknown', () => {
    expect(classifyCookie('CookieConsent', 'shop.example').category).toBe('Essential');
    expect(classifyCookie('session_id', 'shop.example')).toEqual({ category: 'Unknown', trackerId: null });
  });
});
