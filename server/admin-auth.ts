import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { InputError } from '@/lib/server';

export const OWNER_EMAILS = ['jerry@unrepped.co', 'jerry@akatos.com'];
export const SESSION_SECONDS = 8 * 60 * 60;
export const LINK_SECONDS = 15 * 60;
export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string')
    throw new InputError('Enter an email address.');
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(
      email,
    )
  )
    throw new InputError('Enter a valid email address.');
  return email;
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
export function cookieName(request: Request) {
  return new URL(request.url).protocol === 'https:'
    ? '__Host-garden-admin'
    : 'garden_admin_local';
}
export function sessionCookie(
  request: Request,
  token: string,
  age = SESSION_SECONDS,
) {
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function readSession(request: Request) {
  const value =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName(request) + '='))
      ?.split('=')[1] || '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}
export async function allowed(email: string) {
  return (
    OWNER_EMAILS.includes(email) ||
    Boolean(
      await database()
        .prepare('SELECT email FROM garden_admins WHERE email=?')
        .bind(email)
        .first(),
    )
  );
}
export async function requireModerator(request: Request) {
  const token = readSession(request);
  const row = token
    ? await database()
        .prepare(
          "SELECT email FROM admin_tokens WHERE hash=? AND kind='session' AND expires_at>?",
        )
        .bind(await digest(token), Date.now())
        .first<{ email: string }>()
    : null;
  if (!row || !(await allowed(row.email)))
    throw new InputError('Sign in to manage the garden.', 401);
  return row.email;
}
export function adminJSON(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
}
export function adminFailure(error: unknown) {
  return adminJSON(
    {
      error:
        error instanceof InputError
          ? error.message
          : 'Couldn’t complete that action. Try again.',
    },
    error instanceof InputError ? error.status : 503,
  );
}
export function audit(actor: string, action: string, target: string) {
  return database()
    .prepare(
      'INSERT INTO admin_audit(id,actor,action,target,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(crypto.randomUUID(), actor, action, target, Date.now());
}
export async function loginLimit(request: Request, email: string) {
  if (!env.RATE_LIMIT_SECRET)
    throw new InputError('Admin sign-in is not configured yet.', 503);
  const now = Date.now(),
    db = database();
  const scopes: [string, number, number][] = [
    [
      'ip:' + (request.headers.get('cf-connecting-ip') || 'unknown'),
      10,
      900000,
    ],
    ['email:' + email, 3, 900000],
    ['all', 60, 3600000],
  ];
  for (const [scope, max, window] of scopes) {
    const key =
      'admin-login:' + (await digest(env.RATE_LIMIT_SECRET + ':' + scope));
    const results = await db.batch([
      db
        .prepare('DELETE FROM rate_limits WHERE key=? AND expires_at<=?')
        .bind(key, now),
      db
        .prepare(
          'INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?',
        )
        .bind(key, now + window, max),
    ]);
    if (!results[1].meta.changes)
      throw new InputError('Too many requests. Try again in 15 minutes.', 429);
  }
}

export async function issueAdminSession(request: Request, email: string) {
  const token = randomToken(),
    db = database(),
    now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM admin_tokens WHERE expires_at<=?').bind(now),
    db
      .prepare(
        "INSERT INTO admin_tokens(hash,email,kind,expires_at) VALUES (?,?,'session',?)",
      )
      .bind(await digest(token), email, now + SESSION_SECONDS * 1000),
  ]);
  return adminJSON({ email }, 200, sessionCookie(request, token));
}
