import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  requireModerator,
  audit,
} from '@/server/admin-auth';

export async function GET(request: Request) {
  try {
    await requireModerator(request);
    const rows = await database()
      .prepare(`
      SELECT id,'idea' AS kind,description AS body,display_name AS displayName,moderation_reason AS reason,created_at AS createdAt FROM ideas WHERE moderation_state='pending'
      UNION ALL
      SELECT id,'reply' AS kind,body,display_name AS displayName,moderation_reason AS reason,created_at AS createdAt FROM comments WHERE moderation_state='pending'
      ORDER BY createdAt,id LIMIT 100`)
      .all();
    return adminJSON({ items: rows.results });
  } catch (error) {
    return adminFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireModerator(request);
    const body = await readBody(request);
    if (
      !/^[a-f0-9-]{36}$/.test(body?.id || '') ||
      !['idea', 'reply'].includes(body?.kind) ||
      !['approve', 'dismiss'].includes(body?.action)
    )
      throw new InputError('Choose a submission and review action.');
    const table = body.kind === 'idea' ? 'ideas' : 'comments';
    const state = body.action === 'approve' ? 'visible' : 'hidden';
    await database().batch([
      database()
        .prepare(
          `UPDATE ${table} SET moderation_state=? WHERE id=? AND moderation_state='pending'`,
        )
        .bind(state, body.id),
      audit(actor, body.action + '-' + body.kind, body.id),
    ]);
    return adminJSON({ ok: true });
  } catch (error) {
    return adminFailure(error);
  }
}
