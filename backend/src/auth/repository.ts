// All SQL for accounts and sessions. Parameterised like the rest: input never becomes SQL text.

import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';

export interface User {
  id: string;
  email: string;
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Creates the account. The very first account also adopts scans made before accounts existed,
 * so upgrading an existing install doesn't hide its history. Returns null if the email is taken.
 */
export async function createUser(pool: pg.Pool, email: string, passwordHash: string): Promise<User | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<User>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email`,
      [email, passwordHash],
    );
    const user = rows[0] ?? null;
    if (user) {
      const { rows: count } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
      if (count[0]!.n === 1) await client.query('UPDATE scans SET user_id = $1 WHERE user_id IS NULL', [user.id]);
    }
    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function findUserByEmail(db: pg.Pool, email: string): Promise<(User & { passwordHash: string }) | null> {
  const { rows } = await db.query<User & { passwordHash: string }>(
    'SELECT id, email, password_hash AS "passwordHash" FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

/** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
export async function createSession(db: pg.Pool, userId: string, days: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(`DELETE FROM sessions WHERE expires_at < now()`);
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [tokenHash(token), userId, days],
  );
  return token;
}

export async function userForSession(db: pg.Pool, token: string): Promise<User | null> {
  const { rows } = await db.query<User>(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  );
  return rows[0] ?? null;
}

export async function deleteSession(db: pg.Pool, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)]);
}
