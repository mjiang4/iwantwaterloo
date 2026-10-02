import { env } from 'cloudflare:workers';
export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function visitorCookieName() {
  return env.GARDEN_ENV === 'preview'
    ? 'garden_preview_visitor'
    : 'garden_visitor';
}
// The visitor cookie is HMAC-signed as `<uuid>.<hmac>` so a bot cannot mint a valid
// anonymous identity by inventing a UUID. Legacy unsigned (bare-UUID) cookies and any
// cookie with a bad signature are treated as absent: the client silently re-establishes
// one signed cookie through /api/visitor on its next write. Pre-existing anonymous
// like/authorship rows keyed to those old UUIDs are orphaned by this change; that is an
// accepted one-time cost for closing the vote-bot hole on an anonymous civic garden.
function visitorSecret() {
  const secret =
    env.RATE_LIMIT_SECRET ||
    (import.meta.env.DEV ? 'local-development-only' : '');
  if (!secret) throw new Error('Abuse protection is not configured');
  return secret;
}
async function hmacHex(message: string) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(visitorSecret()),
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
// HMAC inputs are domain-separated with a "visitor:" prefix so a cookie signature can
// never be interchanged with a rate-limit bucket key (which uses its own "rl:" prefix).
/** Produce the signed cookie value for a visitor UUID. */
export async function signVisitor(id: string) {
  return `${id}.${await hmacHex('visitor:' + id)}`;
}
/** Return the UUID from a signed cookie value, or null if unsigned/forged. */
async function verifyVisitor(raw: string) {
  const dot = raw.indexOf('.');
  if (dot !== 36) return null;
  const id = raw.slice(0, dot),
    mac = raw.slice(dot + 1);
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(mac)) return null;
  const expected = await hmacHex('visitor:' + id);
  // Length-constant comparison; both values are fixed-length hex.
  if (mac.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < mac.length; i++)
    diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? id : null;
}
export async function identity(request: Request) {
  const name = visitorCookieName();
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='))
    ?.slice(name.length + 1);
  // Fail safe on a read: a missing signing secret (misconfiguration) must not throw an
  // unhandled error on a GET; treat the visitor as unestablished instead.
  const existing = raw ? await verifyVisitor(raw).catch(() => null) : null;
  return {
    id: existing || crypto.randomUUID(),
    existing: Boolean(existing),
  };
}
export async function requireVisitor(request: Request) {
  if (!(await identity(request)).existing)
    throw new InputError(
      'Refresh the page and allow cookies to keep your ideas and likes.',
      409,
    );
}
export async function response(
  request: Request,
  id: string,
  data: unknown,
  status = 200,
  retryAfter?: number,
  // When undefined, a cookie is (re)issued only to a visitor who ALREADY holds a valid
  // signed cookie. Pass true to issue one on the single legitimate establishment response
  // (successful POST /api/visitor). This stops a 4xx — e.g. a Turnstile failure — from
  // handing an unestablished caller a usable signed cookie.
  setCookie?: boolean,
) {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const issue =
    !['GET', 'HEAD'].includes(request.method) &&
    (setCookie ?? (await identity(request)).existing);
  if (issue)
    headers['Set-Cookie'] =
      `${visitorCookieName()}=${await signVisitor(id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
  if (retryAfter) headers['Retry-After'] = String(retryAfter);
  return Response.json(data, { status, headers });
}
export async function readBody(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new InputError('Please submit from the garden page.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new InputError('Please send a valid form.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('The form is empty.');
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 12000) {
      await reader.cancel();
      throw new InputError('This idea is too long.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, pos);
    pos += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InputError('Please send a valid form.');
  }
}
export async function failure(request: Request, id: string, error: unknown) {
  if (!(error instanceof InputError))
    console.error(
      'Garden storage operation failed',
      error instanceof Error ? error.message : 'Unknown',
    );
  return response(
    request,
    id,
    {
      error:
        error instanceof InputError
          ? error.message
          : 'Couldn’t save or load this. Try again.',
    },
    error instanceof InputError ? error.status : 503,
    error instanceof InputError ? error.retryAfter : undefined,
  );
}
