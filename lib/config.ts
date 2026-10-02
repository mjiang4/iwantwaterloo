import { env } from 'cloudflare:workers';

/**
 * The Turnstile sitekey is public (it ships in the widget markup), but there is no
 * build-time client env channel in this app, so the client reads it from /api/visitor.
 * Empty string means Turnstile is not provisioned; the client then renders no widget
 * and sends no token, and the server verification is a matching no-op.
 */
export function turnstileSitekey() {
  return env.TURNSTILE_SITEKEY || '';
}
