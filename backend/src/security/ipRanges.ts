import { BlockList, isIP } from 'node:net';

// Addresses the scanner must never visit: private networks, loopback, cloud metadata,
// and other special-purpose ranges (IANA registries). Anything not public is blocked.
const blocked = new BlockList();

const IPV4_RANGES: [string, number][] = [
  ['0.0.0.0', 8], //        "this network"
  ['10.0.0.0', 8], //       private
  ['100.64.0.0', 10], //    carrier-grade NAT
  ['127.0.0.0', 8], //      loopback (localhost)
  ['169.254.0.0', 16], //   link-local, includes cloud metadata 169.254.169.254
  ['172.16.0.0', 12], //    private
  ['192.0.0.0', 24], //     IETF protocol assignments
  ['192.0.2.0', 24], //     documentation
  ['192.168.0.0', 16], //   private (home routers)
  ['198.18.0.0', 15], //    benchmarking
  ['198.51.100.0', 24], //  documentation
  ['203.0.113.0', 24], //   documentation
  ['224.0.0.0', 4], //      multicast
  ['240.0.0.0', 4], //      reserved, includes broadcast 255.255.255.255
];

const IPV6_RANGES: [string, number][] = [
  ['::', 128], //           unspecified
  ['::1', 128], //          loopback
  ['64:ff9b::', 96], //     IPv4/IPv6 translation
  ['100::', 64], //         discard
  ['2001:db8::', 32], //    documentation
  ['fc00::', 7], //         unique local (private)
  ['fe80::', 10], //        link-local
  ['ff00::', 8], //         multicast
];

for (const [address, prefix] of IPV4_RANGES) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of IPV6_RANGES) blocked.addSubnet(address, prefix, 'ipv6');
// No rule needed for IPv4-mapped IPv6 (::ffff:127.0.0.1): BlockList checks those
// against the IPv4 rules above. Adding ::ffff:0:0/96 would block every IPv4 address.

/** True when the scanner must not connect to this IP. Anything that isn't an IP is blocked too. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family === 6) return blocked.check(ip, 'ipv6');
  return true; // not an IP at all: fail closed
}