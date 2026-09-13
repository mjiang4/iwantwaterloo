import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { InputError } from '@/lib/server';
// Cloudflare supplies the connecting IP in production. Raw addresses are never stored.
export async function limitWrites(
  request: Request,
  visitorId: string,
  scope: 'ideas' | 'support' | 'comments' | 'reports',
  now = Date.now(),
) {
  const secret =
    env.RATE_LIMIT_SECRET ||
    (import.meta.env.DEV ? 'local-development-only' : '');
  if (!secret) throw new Error('Abuse protection is not configured');
  const ip = request.headers.get('cf-connecting-ip');
  const network = ip || `browser:${visitorId}`;
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
    new TextEncoder().encode(
      `${scope}:${Math.floor(now / 86400000)}:${network}`,
    ),
  );
  const key = Array.from(new Uint8Array(signature), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
  const duration = scope === 'ideas' || scope === 'comments' ? 600000 : 60000,
    maximum = scope === 'ideas' ? 120 : scope === 'comments' ? 80 : 300;
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
