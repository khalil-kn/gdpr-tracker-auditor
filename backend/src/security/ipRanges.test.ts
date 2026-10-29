import { describe, expect, it } from 'vitest';
import { isBlockedAddress } from './ipRanges.ts';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', // localhost
    '10.0.0.5', // private
    '172.16.4.2', // private
    '192.168.1.1', // home router
    '169.254.169.254', // cloud metadata
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1', // multicast
    '255.255.255.255', // broadcast
    '::1', // IPv6 localhost
    '::ffff:127.0.0.1', // IPv4 localhost hidden inside IPv6
    'fc00::1', // IPv6 private
    'fe80::1', // IPv6 link-local
    'not-an-ip', // fail closed
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    '93.184.215.14', // a public IPv4 address
    '8.8.8.8',
    '2606:4700:4700::1111', // a public IPv6 address
  ])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});