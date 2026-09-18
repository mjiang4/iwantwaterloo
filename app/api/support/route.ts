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
  const { id } = identity(request);
  try {
    requireVisitor(request);
    const raw = await readBody(request);
    if (
      !raw ||
      typeof raw.ideaId !== 'string' ||
      raw.ideaId.length > 80 ||
      typeof raw.watered !== 'boolean'
    )
      throw new InputError('Please choose an idea to support.');
    const db = database();
    if (
      !(await db
        .prepare('SELECT id FROM ideas WHERE id=?')
        .bind(raw.ideaId)
        .first())
    )
      throw new InputError('That idea is no longer in the garden.', 404);
    await limitWrites(request, id, 'support');
    const action = raw.watered
      ? db
          .prepare(
            'INSERT INTO supports (idea_id,visitor_id,created_at) VALUES (?,?,?) ON CONFLICT(idea_id,visitor_id) DO NOTHING',
          )
          .bind(raw.ideaId, id, Date.now())
      : db
          .prepare('DELETE FROM supports WHERE idea_id=? AND visitor_id=?')
          .bind(raw.ideaId, id);
    const result = await db.batch<Record<string, unknown>>([
      action,
      db
        .prepare(
          'SELECT count(*) AS waters,coalesce(max(visitor_id=?),0) AS watered FROM supports WHERE idea_id=?',
        )
        .bind(id, raw.ideaId),
    ]);
    return response(request, id, {
      id: raw.ideaId,
      waters: Number(result[1].results[0].waters),
      watered: Boolean(result[1].results[0].watered),
    });
  } catch (error) {
    return failure(request, id, error);
  }
}
