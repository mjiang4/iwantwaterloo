import { database } from '@/db/raw';
import {
  failure,
  identity,
  requireVisitor,
  InputError,
  readBody,
  response,
} from '@/lib/server';
import { limitWrites } from '@/lib/rate-limit';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export async function POST(request: Request) {
  const { id } = await identity(request);
  try {
    await requireVisitor(request);
    const raw = await readBody(request);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new InputError('Choose something to report.');
    const value = raw as Record<string, unknown>;
    const ideaId = typeof value.ideaId === 'string' ? value.ideaId : '';
    const commentId =
      typeof value.commentId === 'string' ? value.commentId : '';
    const loveId = typeof value.loveId === 'string' ? value.loveId : '';
    const reason =
      typeof value.reason === 'string' ? value.reason.trim().slice(0, 240) : '';
    const targets = [ideaId, commentId, loveId].filter(Boolean).length;
    if ([ideaId, commentId, loveId].some((id) => id && !UUID.test(id)))
      throw new InputError('That contribution is no longer available.', 404);
    if (!targets || !reason)
      throw new InputError('Add a short reason for the report.');
    if (targets > 1)
      throw new InputError('Choose one idea, reply, or love to report.');
    const db = database();
    const target = commentId
      ? await db
          .prepare(
            "SELECT id FROM comments WHERE id=? AND moderation_state='visible'",
          )
          .bind(commentId)
          .first()
      : loveId
        ? await db
            .prepare(
              "SELECT id FROM loves WHERE id=? AND moderation_state='visible'",
            )
            .bind(loveId)
            .first()
        : await db
            .prepare(
              "SELECT id FROM ideas WHERE id=? AND moderation_state='visible'",
            )
            .bind(ideaId)
            .first();
    if (!target)
      throw new InputError('That contribution is no longer available.', 404);
    await limitWrites(request, id, 'reports');
    // One open report per visitor and target: repeats are accepted but not stored.
    await db
      .prepare(
        'INSERT INTO reports (id,idea_id,comment_id,love_id,reason,visitor_id,created_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM reports WHERE visitor_id=? AND idea_id IS ? AND comment_id IS ? AND love_id IS ?)',
      )
      .bind(
        crypto.randomUUID(),
        ideaId || null,
        commentId || null,
        loveId || null,
        reason,
        id,
        Date.now(),
        id,
        ideaId || null,
        commentId || null,
        loveId || null,
      )
      .run();
    return response(request, id, { reported: true }, 201);
  } catch (error) {
    return failure(request, id, error);
  }
}
