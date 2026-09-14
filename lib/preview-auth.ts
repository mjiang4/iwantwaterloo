import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { InputError, visitorCookieName } from '@/lib/server';
const COOKIE = 'garden_preview_admin';
export const sessionLifetime = 8 * 60 * 60;
export function previewConfigured() {
  return (
    env.GARDEN_ENV === 'preview' &&
    /^preview-[a-z0-9-]{8,80}$/.test(env.PREVIEW_ID || '') &&
    (env.PREVIEW_ADMIN_SECRET?.length || 0) >= 32 &&
    !!env.PREVIEW_ORIGIN
  );
}
export async function requirePreview(request: Request) {
  const origin = new URL(request.url).origin;
  if (
    !previewConfigured() ||
    origin !== env.PREVIEW_ORIGIN ||
    /^(www\.)?iwantwaterloo\.com$/.test(new URL(origin).hostname) ||
    new URL(origin).hostname ===
      'waterloo-idea-garden.helloimjerry.chatgpt.site'
  )
    throw new InputError('Not found.', 404);
  // Never create this marker from an HTTP request. Provision it only in an isolated DB.
  const marker = await database()
    .prepare('SELECT value FROM preview_identity WHERE id=1')
    .first<{ value: string }>();
  if (marker?.value !== env.PREVIEW_ID)
    throw new InputError(
      'Preview database identity does not match. Controls are locked.',
      503,
    );
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
export function sessionToken(request: Request) {
  const value =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(COOKIE + '='))
      ?.slice(COOKIE.length + 1) || '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}
export async function requireAdmin(request: Request) {
  await requirePreview(request);
  if (
    env.PREVIEW_AUTH === 'sites-owner' &&
    env.PREVIEW_OWNER_EMAIL &&
    request.headers.get('oai-authenticated-user-email')?.toLowerCase() ===
      env.PREVIEW_OWNER_EMAIL.toLowerCase()
  )
    return;
  const value = sessionToken(request);
  const found =
    value &&
    (await database()
      .prepare(
        "SELECT 1 AS ok FROM preview_sessions WHERE token_hash=? AND kind='session' AND expires_at>?",
      )
      .bind(await hash(value), Date.now())
      .first());
  if (!found) throw new InputError('Sign in to test this preview.', 401);
}
export function adminResponse(
  data: unknown,
  status = 200,
  cookies: string[] = [],
) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return Response.json(data, { status, headers });
}
export function adminError(error: unknown) {
  if (!(error instanceof InputError))
    console.error(
      'Preview operation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  const response = adminResponse(
    {
      error:
        error instanceof InputError
          ? error.message
          : 'The preview could not complete this action.',
    },
    error instanceof InputError ? error.status : 503,
  );
  if (error instanceof InputError && error.retryAfter)
    response.headers.set('Retry-After', String(error.retryAfter));
  return response;
}
export function adminCookie(
  request: Request,
  value: string,
  age = sessionLifetime,
) {
  return `${COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function visitorCookie(request: Request, id: string) {
  return `${visitorCookieName()}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function createSession(request: Request) {
  const value = token();
  await database().batch([
    database()
      .prepare('DELETE FROM preview_sessions WHERE expires_at<=?')
      .bind(Date.now()),
    database()
      .prepare(
        'INSERT INTO preview_sessions(token_hash,kind,expires_at) VALUES (?,?,?)',
      )
      .bind(await hash(value), 'session', Date.now() + sessionLifetime * 1000),
  ]);
  return adminResponse({ ok: true }, 200, [adminCookie(request, value)]);
}
export async function verifyOperatorKey(candidate: unknown) {
  if (
    typeof candidate !== 'string' ||
    candidate.length < 32 ||
    candidate.length > 256
  )
    return false;
  const algorithm = { name: 'HMAC', hash: 'SHA-256' },
    encoder = new TextEncoder(),
    message = encoder.encode('waterloo-preview-operator');
  const [actual, provided] = await Promise.all([
    crypto.subtle.importKey(
      'raw',
      encoder.encode(env.PREVIEW_ADMIN_SECRET!),
      algorithm,
      false,
      ['verify'],
    ),
    crypto.subtle.importKey(
      'raw',
      encoder.encode(candidate),
      algorithm,
      false,
      ['sign'],
    ),
  ]);
  return crypto.subtle.verify(
    'HMAC',
    actual,
    await crypto.subtle.sign('HMAC', provided, message),
    message,
  );
}
export async function loginAttempt(request: Request) {
  const key =
      'preview-login:' +
      (await hash(
        `${env.PREVIEW_ADMIN_SECRET}:${request.headers.get('cf-connecting-ip') || 'local'}`,
      )),
    db = database(),
    now = Date.now();
  const [_, result] = await db.batch([
    db
      .prepare('DELETE FROM rate_limits WHERE key=? AND expires_at<=?')
      .bind(key, now),
    db
      .prepare(
        'INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<20',
      )
      .bind(key, now + 600000),
  ]);
  if (!result.meta.changes)
    throw new InputError(
      'Too many sign-in attempts. Try again in 10 minutes.',
      429,
      600,
    );
}
