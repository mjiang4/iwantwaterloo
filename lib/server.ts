import {
  CATEGORIES,
  CONNECTIONS,
  normalizeTag,
  validTag,
  categoryForTags,
  LEGACY_TAGS,
  connectionGroup,
  type Category,
} from './garden';
export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function identity(request: Request) {
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('garden_visitor='))
    ?.slice(15);
  const existing = raw && /^[a-f0-9-]{36}$/.test(raw) ? raw : null;
  return {
    id: existing || crypto.randomUUID(),
    cookie: existing ? null : undefined,
  };
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
      `garden_visitor=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
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
export function validateIdea(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new InputError('Please complete the idea form.');
  const v = raw as Record<string, unknown>;
  function field(name: string, max: number, min = 0) {
    if (v[name] !== undefined && typeof v[name] !== 'string')
      throw new InputError(`Please check ${name}.`);
    const t = String(v[name] ?? '').trim();
    if (t.length < min || t.length > max)
      throw new InputError(
        `${name === 'title' ? 'Title' : name === 'description' ? 'Idea' : name} must be ${min}–${max} characters.`,
      );
    return t;
  }
  const title = field('title', 90, 5),
    description = field('description', 1400, 5),
    category = field('category', 30),
    place = field('place', 90),
    connection = field('connection', 60),
    displayName = field('displayName', 60);
  if (category && !CATEGORIES.some((c) => c.id === category))
    throw new InputError('Choose a valid tag.');
  if (
    v.tags !== undefined &&
    (!Array.isArray(v.tags) ||
      v.tags.length > 3 ||
      v.tags.some((t) => typeof t !== 'string'))
  )
    throw new InputError('Use up to 3 tags.');
  const tags =
    v.tags === undefined
      ? LEGACY_TAGS[category] || []
      : [...new Set((v.tags as string[]).map(normalizeTag))];
  if (tags.some((t) => !validTag(t)))
    throw new InputError('Tags need 2–24 letters or numbers.');
  if (connection && !CONNECTIONS.some((c) => c === connectionGroup(connection)))
    throw new InputError('Choose a connection to Waterloo.');
  if (v.consent !== true)
    throw new InputError('Confirm sharing with visitors.');
  if (v.website)
    throw new InputError('We could not plant this idea. Please try again.');
  const submissionKey = field('submissionKey', 36);
  if (
    submissionKey &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      submissionKey,
    )
  )
    throw new InputError('Please retry this idea.');
  return {
    title,
    description,
    submissionKey: submissionKey || null,
    category: (category || categoryForTags(tags)) as Category,
    tags,
    place,
    connection: connectionGroup(connection),
    displayName: displayName || null,
  };
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

// Legacy records remain intact; old category names become searchable tags.
export const tagsSQL =
  "CASE WHEN i.tags != '[]' THEN i.tags ELSE CASE i.category WHEN 'nature' THEN '[\"parks\"]' WHEN 'mobility' THEN '[\"cycling\"]' WHEN 'homes' THEN '[\"housing\"]' WHEN 'culture' THEN '[\"arts\"]' WHEN 'learning' THEN '[\"learning\"]' WHEN 'business' THEN '[\"small-business\"]' ELSE '[]' END END";
export const connectionSQL =
  "CASE i.connection WHEN 'I live here' THEN 'From Waterloo' WHEN 'I study here' THEN 'Studying in Waterloo' WHEN 'I visit' THEN 'Interested from elsewhere' ELSE i.connection END";
