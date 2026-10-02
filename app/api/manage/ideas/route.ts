import { database } from '@/db/raw';
import { IDEA_FROM } from '@/server/idea-records';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  requireModerator,
  audit,
  auditIfChanged,
} from '@/server/admin-auth';
export async function GET(request: Request) {
  try {
    await requireModerator(request);
    const url = new URL(request.url),
      offset = Math.max(
        0,
        Math.min(
          100000,
          Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0,
        ),
      );
    const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
    const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    // Optional moderation filter so moderators can find pending items to approve.
    const state = url.searchParams.get('state') || 'visible';
    if (!['visible', 'pending', 'hidden'].includes(state))
      throw new InputError('Choose a valid moderation state.');
    const rows = await database()
      // The current public text (latest approved update), searchable alongside the original.
      .prepare(`SELECT i.id,coalesce(u.title,i.title) AS title,coalesce(u.description,i.description) AS description,
      i.display_name AS displayName,i.place,i.created_at AS createdAt,
      i.moderation_state AS moderationState,
      (SELECT count(*) FROM comments WHERE idea_id=i.id) AS comments,
      (SELECT count(*) FROM supports WHERE idea_id=i.id) AS likes
      ${IDEA_FROM} WHERE (coalesce(u.description,i.description) LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\') AND i.moderation_state=? ORDER BY i.created_at DESC,i.id LIMIT 51 OFFSET ?`)
      .bind(pattern, pattern, state, offset)
      .all();
    return adminJSON({
      ideas: rows.results.slice(0, 50),
      nextOffset: rows.results.length > 50 ? offset + 50 : null,
    });
  } catch (error) {
    return adminFailure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireModerator(request),
      body = await readBody(request);
    if (
      typeof body?.id !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(body.id) ||
      (body.state !== 'visible' && body.state !== 'hidden')
    )
      throw new InputError('Choose an idea and a moderation state.');
    const db = database();
    const results = await db.batch([
      db
        .prepare('UPDATE ideas SET moderation_state=? WHERE id=?')
        .bind(body.state, body.id),
      audit(actor, 'moderate-idea', `${body.id}:${body.state}`),
    ]);
    if (!results[0].meta.changes)
      throw new InputError('That idea is no longer available.', 404);
    return adminJSON({ ok: true, id: body.id, state: body.state });
  } catch (error) {
    return adminFailure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const actor = await requireModerator(request),
      body = await readBody(request);
    if (
      typeof body?.id !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(body.id) ||
      body.confirm !== true
    )
      throw new InputError('Confirm the idea you want to delete.');
    const id = body.id,
      db = database();
    const results = await db.batch([
      db
        .prepare(
          'DELETE FROM reports WHERE idea_id=? OR comment_id IN (SELECT id FROM comments WHERE idea_id=?)',
        )
        .bind(id, id),
      db.prepare('DELETE FROM comments WHERE idea_id=?').bind(id),
      db.prepare('DELETE FROM supports WHERE idea_id=?').bind(id),
      db.prepare('DELETE FROM ideas WHERE id=?').bind(id),
      auditIfChanged(actor, 'delete-idea', id),
    ]);
    return adminJSON({ ok: true, removed: results[3].meta.changes });
  } catch (error) {
    return adminFailure(error);
  }
}
