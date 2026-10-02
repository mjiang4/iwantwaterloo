import { database } from '@/db/raw';
import {
  identity,
  requireVisitor,
  response,
  readBody,
  failure,
  InputError,
} from '@/lib/server';
import { limitWrites } from '@/lib/rate-limit';
import { screenSubmission } from '@/server/moderation';
import { notifyModerators } from '@/server/moderation-notifications';
import { LOVE_LANDMARKS } from '@/features/loves/model';
import { findLove, listLoves } from '@/server/love-records';
import PARK_BOUNDS from '@/features/park/bounds.json';

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
/** Plain text: tabs and newlines are allowed, other control characters are not. */
function hasControl(value: string) {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) return true;
  }
  return false;
}

function validateLove(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new InputError('Please write what you love.');
  const v = raw as Record<string, unknown>;
  function optional(name: string) {
    if (
      v[name] !== undefined &&
      v[name] !== null &&
      typeof v[name] !== 'string'
    )
      throw new InputError(`Please check ${name}.`);
    return String(v[name] ?? '').trim();
  }
  const body = optional('body');
  if (body.length < 3 || body.length > 200)
    throw new InputError('Love must be 3–200 characters.');
  if (hasControl(body)) throw new InputError('Please use plain text.');
  const displayName = optional('displayName');
  if (displayName.length > 60 || hasControl(displayName))
    throw new InputError('displayName must be 0–60 characters.');
  const landmark = optional('landmark');
  if (landmark && !(LOVE_LANDMARKS as readonly string[]).includes(landmark))
    throw new InputError('Choose a place in the park.');
  const { x, z } = v;
  if (
    typeof x !== 'number' ||
    typeof z !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    x < PARK_BOUNDS.west ||
    x > PARK_BOUNDS.east ||
    z < PARK_BOUNDS.north ||
    z > PARK_BOUNDS.south
  )
    throw new InputError('Choose a spot inside Waterloo Park.');
  const submissionKey = optional('submissionKey');
  if (!UUID.test(submissionKey))
    throw new InputError('Please retry this love.');
  return {
    body,
    x,
    z,
    landmark: landmark || null,
    displayName: displayName || null,
    submissionKey,
  };
}

export async function GET(request: Request) {
  const { id } = await identity(request);
  try {
    return response(request, id, { loves: await listLoves(id) });
  } catch (error) {
    return failure(request, id, error);
  }
}
export async function POST(request: Request) {
  const { id } = await identity(request);
  try {
    await requireVisitor(request);
    const { submissionKey, ...fields } = validateLove(await readBody(request)),
      db = database(),
      loveId = crypto.randomUUID(),
      now = Date.now();
    async function previous() {
      const original = await db
        .prepare(
          'SELECT id,visitor_id,body,x,z,landmark,display_name FROM loves WHERE submission_key=?',
        )
        .bind(submissionKey)
        .first();
      if (!original) return null;
      if (
        original.visitor_id !== id ||
        original.body !== fields.body ||
        original.x !== fields.x ||
        original.z !== fields.z ||
        original.landmark !== fields.landmark ||
        original.display_name !== fields.displayName
      )
        throw new InputError(
          'This submission changed. Edit the love and try again.',
          409,
        );
      return findLove(String(original.id), id);
    }

    const saved = await previous();
    if (saved) return response(request, id, { love: saved });
    await limitWrites(request, id, 'loves');
    // Loves are public text, screened like ideas and replies before they bloom.
    const screening = await screenSubmission(
      [fields.body, fields.displayName].filter(Boolean).join('\n'),
    );
    const result = await db
      .prepare(
        'INSERT INTO loves (id,body,x,z,landmark,display_name,created_at,visitor_id,submission_key,moderation_state,moderation_reason) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM loves WHERE visitor_id=? AND created_at>?) < 5 ON CONFLICT(submission_key) DO NOTHING',
      )
      .bind(
        loveId,
        fields.body,
        fields.x,
        fields.z,
        fields.landmark,
        fields.displayName,
        now,
        id,
        submissionKey,
        screening.state,
        screening.reason,
        id,
        now - 600000,
      )
      .run();
    if (!result.meta.changes) {
      const saved = await previous();
      if (saved) return response(request, id, { love: saved });
      throw new InputError(
        'You’ve shared a few loves. Try again in 10 minutes.',
        429,
        600,
      );
    }
    if (screening.state === 'pending') await notifyModerators();
    return response(
      request,
      id,
      {
        love: {
          id: loveId,
          moderationState: screening.state,
          body: fields.body,
          x: fields.x,
          z: fields.z,
          landmark: fields.landmark || undefined,
          displayName: fields.displayName || undefined,
          createdAt: now,
          echoes: 0,
          echoed: false,
          owned: true,
        },
      },
      201,
    );
  } catch (error) {
    return failure(request, id, error);
  }
}
