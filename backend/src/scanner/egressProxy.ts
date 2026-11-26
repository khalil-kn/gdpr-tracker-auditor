// SSRF defence, last layer: Chromium reaches the web only through this local forward proxy.
//
// Why: requestGuard checks a hostname's addresses, but Chromium then resolves the name AGAIN to connect.
// A hostile DNS server can answer "public" to the guard and "127.0.0.1" to the browser (DNS rebinding).
// Here the proxy resolves the name itself, checks every address, and connects to the exact IP it
// checked. The browser never resolves names at all, so there is no second answer to swap.
//
// HTTPS and WebSockets arrive as CONNECT host:port tunnels (the proxy never sees inside TLS);
// plain HTTP arrives as GET http://host/path and is forwarded to the checked IP.

import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect, isIP, type AddressInfo, type Socket } from 'node:net';
import { isBlockedAddress } from '../security/ipRanges.ts';
import { dnsLookup, type LookupFn } from '../security/urlGuard.ts';

export interface EgressProxy {
  /** For Playwright's launch({ proxy: { server } }). */
  url: string;
  /** host:port of every connection refused, for logs and tests. */
  refused: string[];
  close(): Promise<void>;
}

export interface EgressOptions {
  resolve?: LookupFn;
  isBlocked?: (ip: string) => boolean;
  idleTimeoutMs?: number;
}

/** Marks the proxy's own refusal page, so the scanner can tell it from a site's 403. */
export const BLOCKED_HEADER = 'x-scanner-blocked';

// Headers that describe the hop to the proxy, not the request: never forwarded.
const HOP_HEADERS = ['proxy-connection', 'proxy-authorization', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade'];

export async function startEgressProxy(o: EgressOptions = {}): Promise<EgressProxy> {
  const resolve = o.resolve ?? dnsLookup;
  const isBlocked = o.isBlocked ?? isBlockedAddress;
  const idle = o.idleTimeoutMs ?? 60_000;
  const refused: string[] = [];
  const sockets = new Set<Socket>();

  /** The one IP to connect to; 'blocked' when the host or any of its addresses is not public. */
  async function target(host: string): Promise<string | 'blocked' | 'unresolved'> {
    const h = host.replace(/^\[|\]$/g, '');
    if (isIP(h)) return isBlocked(h) ? 'blocked' : h;
    const ips = await resolve(h).catch(() => [] as string[]);
    if (ips.length === 0) return 'unresolved';
    // Every address must be public: a name with one private address could be connected through it.
    return ips.some(isBlocked) ? 'blocked' : ips[0]!;
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Plain HTTP through a proxy: the request line holds the full URL.
    let url: URL;
    try {
      url = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (url.protocol !== 'http:') {
      res.writeHead(400).end();
      return;
    }
    const ip = await target(url.hostname);
    if (ip === 'unresolved') {
      res.writeHead(502, { 'content-type': 'text/plain' }).end('The scanner could not resolve this name.');
      return;
    }
    if (ip === 'blocked') {
      refused.push(url.host);
      res.writeHead(403, { 'content-type': 'text/plain', [BLOCKED_HEADER]: '1' }).end('Blocked by the scanner: not a public address.');
      return;
    }
    const headers = { ...req.headers };
    for (const h of HOP_HEADERS) delete headers[h];
    headers.host = url.host;
    const upstream = httpRequest({
      host: ip, port: Number(url.port || 80), method: req.method, path: url.pathname + url.search, headers, setHost: false,
    }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.setTimeout(idle, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });

  // HTTPS and WebSockets: CONNECT host:port, then the proxy only copies bytes both ways.
  server.on('connect', async (req: IncomingMessage, client: Socket, head: Buffer) => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
    client.on('error', () => client.destroy());
    const m = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(req.url ?? '');
    const port = Number(m?.[2]);
    if (!m || port < 1 || port > 65535) {
      client.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const ip = await target(m[1]!);
    if (ip === 'unresolved') {
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      return;
    }
    if (ip === 'blocked') {
      refused.push(req.url!);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = connect({ host: ip, port }, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    sockets.add(upstream);
    upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
    upstream.setTimeout(idle, () => upstream.destroy());
    upstream.on('error', () => {
      if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
  });

  server.on('connection', (s: Socket) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });

  // Loopback only, random free port: nothing outside this machine can use the proxy.
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    refused,
    close: () => new Promise<void>((ok) => {
      for (const s of sockets) s.destroy();
      server.close(() => ok());
    }),
  };
}
