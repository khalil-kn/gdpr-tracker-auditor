import { Router } from 'express';
import type pg from 'pg';
import { config } from '../config.ts';
import { rateLimit } from '../security/rateLimit.ts';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.ts';
import { clearSessionCookie, readCookie, requireAuth, currentUser, SESSION_COOKIE, setSessionCookie } from './middleware.ts';
import { createSession, createUser, deleteSession, findUserByEmail } from './repository.ts';

export const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128; // scrypt cost grows with length; also stops megabyte "passwords"
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates { email, password }. Returns the clean values or a message for a 400. */
export function parseCredentials(body: unknown): { email: string; password: string } | string {
  if (typeof body !== 'object' || body === null) return 'Send a JSON object.';
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email.trim())) return 'Enter a valid email address.';
  if (typeof password !== 'string') return 'Enter a password.';
  return { email: email.trim().toLowerCase(), password };
}

export function authRouter(pool: pg.Pool): Router {
  const router = Router();
  // Counted per client IP. Login gets its own budget so guessing passwords is slow.
  const loginLimit = rateLimit(10, 15 * 60_000, 'Too many sign-in attempts. Wait 15 minutes and try again.');
  const registerLimit = rateLimit(5, 60 * 60_000, 'Too many accounts created from here. Try again later.');

  router.post('/register', registerLimit, async (req, res) => {
    if (!config.allowRegistration) return res.status(403).json({ message: 'New accounts are closed on this server.' });
    const creds = parseCredentials(req.body);
    if (typeof creds === 'string') return res.status(400).json({ message: creds });
    if (creds.password.length < PASSWORD_MIN || creds.password.length > PASSWORD_MAX) {
      return res.status(400).json({ message: `Use a password of ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.` });
    }
    const user = await createUser(pool, creds.email, await hashPassword(creds.password));
    if (!user) return res.status(409).json({ message: 'An account with this email already exists. Sign in instead.' });
    setSessionCookie(res, await createSession(pool, user.id, config.sessionDays));
    res.status(201).json(user);
  });

  router.post('/login', loginLimit, async (req, res) => {
    const creds = parseCredentials(req.body);
    if (typeof creds === 'string') return res.status(400).json({ message: creds });
    const user = await findUserByEmail(pool, creds.email);
    // Same work and the same answer whether the email exists or not: no account enumeration.
    const ok = await verifyPassword(creds.password.slice(0, PASSWORD_MAX), user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ message: 'Email or password is incorrect.' });
    setSessionCookie(res, await createSession(pool, user.id, config.sessionDays));
    res.json({ id: user.id, email: user.email });
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await deleteSession(pool, token);
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get('/me', requireAuth(pool), (_req, res) => {
    res.json(currentUser(res));
  });

  router.get('/config', (_req, res) => {
    res.json({ registration: config.allowRegistration, passwordMin: PASSWORD_MIN });
  });

  return router;
}
