import { env } from 'cloudflare:workers';
import { InputError } from '@/lib/server';
export function emailConfigured() {
  return Boolean(env.RESEND_API_KEY && env.ADMIN_EMAIL_FROM);
}
export async function sendAdminLink(email: string, token: string, id: string) {
  if (!emailConfigured())
    throw new InputError('Admin sign-in is not configured yet.', 503);
  const origin = env.ADMIN_ORIGIN || 'https://iwantwaterloo.com';
  const url = new URL('/admin', origin);
  if (url.protocol !== 'https:')
    throw new InputError('Admin sign-in is not configured yet.', 503);
  // A fragment keeps the bearer token out of HTTP access logs and referrers.
  url.hash = 'token=' + token;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': id,
    },
    body: JSON.stringify({
      from: env.ADMIN_EMAIL_FROM,
      to: [email],
      subject: 'Sign in to I Want Waterloo',
      text: `Sign in to manage I Want Waterloo:\n\n${url.href}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.`,
    }),
  });
  if (!response.ok)
    throw new InputError(
      'Couldn’t send the sign-in email. Please try again later.',
      503,
    );
}
