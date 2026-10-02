import { env } from 'cloudflare:workers';
import { InputError } from '@/lib/server';
import { turnstileSitekey } from '@/lib/config';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Cloudflare Turnstile token on a write.
 *
 * Inert until keys are provisioned: when TURNSTILE_SECRET is unset or empty this is a
 * no-op, so local preview and an un-provisioned production keep working with no widget
 * and no token. Once Jerry adds TURNSTILE_SECRET (and the client renders the widget
 * with TURNSTILE_SITEKEY), a missing or failed token is rejected with 403.
 */
export async function verifyTurnstile(
  request: Request,
  token: unknown,
): Promise<void> {
  const secret = env.TURNSTILE_SECRET;
  if (!secret || !turnstileSitekey()) return;
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048)
    throw new InputError('Verification failed. Please retry.', 403);
  const body = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) body.set('remoteip', ip);
  let ok = false;
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    ok = data.success === true;
  } catch {
    ok = false;
  }
  if (!ok) throw new InputError('Verification failed. Please retry.', 403);
}
