import { safeNext } from './auth.service';

describe('safeNext', () => {
  it.each([
    ['/scans/42', '/scans/42'],
    ['/', '/'],
    [undefined, '/'],
    ['', '/'],
    ['https://evil.example/', '/'],
    ['//evil.example/', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
