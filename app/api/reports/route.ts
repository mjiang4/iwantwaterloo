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

export async function POST(request: Request) {
  const { id } = identity(request);
  try {
    requireVisitor(request);
    const raw = await readBody(request);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new InputError('Choose something to report.');
    const value = raw as Record<string, unknown>;
    const ideaId = typeof value.ideaId === 'string' ? value.ideaId : '';
    const commentId =
      typeof value.commentId === 'string' ? value.commentId : '';
    const reason =
      typeof value.reason === 'string' ? value.reason.trim().slice(0, 240) : '';
    if ((!ideaId && !commentId) || !reason)
      throw new InputError('Add a short reason for the report.');
    if (ideaId && commentId)
      throw new InputError('Choose one idea or reply to report.');
    const db = database();
    const target = commentId
      ? await db
          .prepare(
            "SELECT id FROM comments WHERE id=? AND moderation_state='visible'",
          )
          .bind(commentId)
          .first()
      : await db
          .prepare('SELECT id FROM ideas WHERE id=?')
          .bind(ideaId)
          .first();
    if (!target)
      throw new InputError('That contribution is no longer available.', 404);
    await limitWrites(request, id, 'reports');
    await db
      .prepare(
        'INSERT INTO reports (id,idea_id,comment_id,reason,visitor_id,created_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(
        crypto.randomUUID(),
        ideaId || null,
        commentId || null,
        reason,
        id,
        Date.now(),
      )
      .run();
    return response(request, id, { reported: true }, 201);
  } catch (error) {
    return failure(request, id, error);
  }
}
