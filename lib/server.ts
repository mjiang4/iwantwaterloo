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
export function identity(request: Request) {
  const name = visitorCookieName();
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='))
    ?.slice(name.length + 1);
  const existing = raw && /^[a-f0-9-]{36}$/.test(raw) ? raw : null;
  return {
    id: existing || crypto.randomUUID(),
    existing: Boolean(existing),
  };
}
export function requireVisitor(request: Request) {
  if (!identity(request).existing)
    throw new InputError(
      'Refresh the page and allow cookies to keep your ideas and likes.',
      409,
    );
}
export function response(
  request: Request,
  id: string,
  data: unknown,
  status = 200,
  retryAfter?: number,
) {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (!['GET', 'HEAD'].includes(request.method))
    headers['Set-Cookie'] =
      `${visitorCookieName()}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
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
export function failure(request: Request, id: string, error: unknown) {
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
