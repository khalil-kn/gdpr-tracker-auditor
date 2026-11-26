import type { Request, RequestHandler, Response } from 'express';
import type pg from 'pg';
import { config } from '../config.ts';
import { userForSession, type User } from './repository.ts';

export const SESSION_COOKIE = 'sid';

/** Reads one cookie from the Cookie header. No dependency needed for a single value. */
export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * HttpOnly: page scripts can't read it, so an XSS can't steal the session.
 * SameSite=Strict: the browser never sends it on requests started by another site (CSRF).
 * Secure: HTTPS only, on in production.
 */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: config.secureCookies, path: '/api',
    maxAge: config.sessionDays * 86_400_000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: config.secureCookies, path: '/api' });
}

/** The signed-in user, set by requireAuth. */
export function currentUser(res: Response): User {
  return res.locals.user as User;
}

/** 401 unless the request carries a valid, unexpired session. Puts the user in res.locals.user. */
export function requireAuth(pool: pg.Pool): RequestHandler {
  return async (req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    const user = token ? await userForSession(pool, token) : null;
    if (!user) return res.status(401).json({ message: 'Sign in to continue.' });
    res.locals.user = user;
    next();
  };
}
