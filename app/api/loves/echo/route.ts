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
export async function PUT(request: Request) {
  const { id } = await identity(request);
  try {
    await requireVisitor(request);
    const raw = await readBody(request);
    if (
      !raw ||
      typeof raw.loveId !== 'string' ||
      raw.loveId.length > 80 ||
      typeof raw.echoed !== 'boolean'
    )
      throw new InputError('Please choose a love to echo.');
    const db = database();
    if (
      !(await db
        .prepare(
          "SELECT id FROM loves WHERE id=? AND moderation_state='visible'",
        )
        .bind(raw.loveId)
        .first())
    )
      throw new InputError('That love is no longer in the park.', 404);
    // Echoes are the same cheap desired-state write as likes; share that budget.
    await limitWrites(request, id, 'support');
    const action = raw.echoed
      ? db
          .prepare(
            'INSERT INTO love_echoes (love_id,visitor_id,created_at) VALUES (?,?,?) ON CONFLICT(love_id,visitor_id) DO NOTHING',
          )
          .bind(raw.loveId, id, Date.now())
      : db
          .prepare('DELETE FROM love_echoes WHERE love_id=? AND visitor_id=?')
          .bind(raw.loveId, id);
    const result = await db.batch<Record<string, unknown>>([
      action,
      db
        .prepare(
          'SELECT count(*) AS echoes,coalesce(max(visitor_id=?),0) AS echoed FROM love_echoes WHERE love_id=?',
        )
        .bind(id, raw.loveId),
    ]);
    return response(request, id, {
      id: raw.loveId,
      echoes: Number(result[1].results[0].echoes),
      echoed: Boolean(result[1].results[0].echoed),
    });
  } catch (error) {
    return failure(request, id, error);
  }
}
