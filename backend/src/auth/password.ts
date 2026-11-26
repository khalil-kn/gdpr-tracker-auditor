// Password hashing with scrypt from node:crypto: memory-hard, so guessing on GPUs is slow, and no dependency.
// Stored format: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>, so the cost can be raised later
// without breaking existing accounts.

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 2 ** 15; // CPU/memory cost: 32 MiB per hash
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, o: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { ...o, maxmem: 128 * o.N! * o.r! * 2 }, (err, key) =>
      err ? reject(err) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Constant-time comparison. A malformed stored hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A real hash of a random password. Checked when the email is unknown, so both cases take the same time. */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
