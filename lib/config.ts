import { env } from 'cloudflare:workers';

/**
 * The Turnstile sitekey is public (it ships in the widget markup), but there is no
 * build-time client env channel in this app, so the client reads it from /api/visitor.
 * Empty string means Turnstile is not provisioned; the client then renders no widget
 * and sends no token, and the server verification is a matching no-op.
 */
export function turnstileSitekey() {
  // Serve the sitekey only when BOTH halves are present. Serving it with no secret would
  // show the widget while nothing is verified; a secret with no sitekey would 403 every
  // write. Either half-configured state is worse than staying inert.
  return env.TURNSTILE_SITEKEY && env.TURNSTILE_SECRET
    ? env.TURNSTILE_SITEKEY
    : '';
}
