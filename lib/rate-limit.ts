import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { InputError } from '@/lib/server';
// Cloudflare supplies the connecting IP in production. Raw addresses are never stored.
function network(request: Request, visitorId: string) {
  return request.headers.get('cf-connecting-ip') || `browser:${visitorId}`;
}
/** Opaque, non-reversible key for a rate-limit bucket. The message encodes the scope. */
async function counterKey(message: string) {
  const secret =
    env.RATE_LIMIT_SECRET ||
    (import.meta.env.DEV ? 'local-development-only' : '');
  if (!secret) throw new Error('Abuse protection is not configured');
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    material,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
}
async function enforce(
  key: string,
  duration: number,
  maximum: number,
  now: number,
) {
  const db = database();
  const results = await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').bind(now),
    db
      .prepare(
        'INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?',
      )
      .bind(key, now + duration, maximum),
  ]);
  if (!results[1].meta.changes)
    throw new InputError(
      'Too many requests. Please try again shortly.',
      429,
      Math.ceil(duration / 1000),
    );
}
export async function limitWrites(
  request: Request,
  visitorId: string,
  scope: 'ideas' | 'support' | 'comments' | 'reports' | 'feedback',
  now = Date.now(),
) {
  const key = await counterKey(
    `${scope}:${Math.floor(now / 86400000)}:${network(request, visitorId)}`,
  );
  const duration =
      scope === 'ideas' || scope === 'comments' || scope === 'feedback'
        ? 600000
        : 60000,
    maximum =
      scope === 'feedback'
        ? 5
        : scope === 'ideas'
          ? 120
          : scope === 'comments'
            ? 80
            : 300;
  await enforce(key, duration, maximum, now);
}
/**
 * Per-IP backstop on how many DISTINCT ideas one network may newly support in a window,
 * on top of the raw support request limit. Call it only when a genuinely new support row
 * is about to be created, so idempotent re-likes do not consume the budget. Keyed on a
 * separate message so it never collides with limitWrites' buckets.
 */
export async function limitDistinctSupport(
  request: Request,
  visitorId: string,
  now = Date.now(),
) {
  const key = await counterKey(
    `support-distinct:${Math.floor(now / 600000)}:${network(request, visitorId)}`,
  );
  await enforce(key, 600000, 60, now);
}
