import { checkUrl } from './url-check';

describe('checkUrl', () => {
  it('accepts public domains and adds https', () => {
    expect(checkUrl('example.com')).toEqual({ kind: 'ok', url: 'https://example.com/', host: 'example.com' });
    expect(checkUrl(' http://shop.example.co.uk/a ').kind).toBe('ok');
  });

  it.each([
    ['', 'empty'],
    ['ftp://example.com', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['http://169.254.169.254/latest/meta-data', 'metadata'],
    ['localhost:5432', 'private'],
    ['http://127.0.0.1', 'private'],
    ['http://192.168.1.1/admin', 'private'],
    ['http://172.20.0.5', 'private'],
    ['http://[::1]/', 'private'],
    ['intranet', 'host'],
    ['https://user:pass@example.com', 'host'],
  ])('%s -> %s', (input, kind) => {
    expect(checkUrl(input).kind).toBe(kind);
  });
});
