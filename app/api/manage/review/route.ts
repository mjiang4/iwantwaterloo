import {
  notifyModerators,
  pendingSubmissionCount,
} from '@/server/moderation-notifications';
import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  requireModerator,
  auditIfChanged,
} from '@/server/admin-auth';

/** Reviewable kinds; the table name is only ever taken from this map. */
const TABLES = {
  idea: 'ideas',
  reply: 'comments',
  update: 'idea_updates',
  love: 'loves',
} as const;

export async function GET(request: Request) {
  try {
    await requireModerator(request);
    const rows = await database()
      // Show every field that becomes public on approval, not only the description.
      .prepare(`
      SELECT id,'idea' AS kind,title || char(10) || char(10) || description || char(10) || char(10) || 'Question: ' || question || CASE WHEN place!='' THEN char(10) || 'Place: ' || place ELSE '' END AS body,display_name AS displayName,moderation_reason AS reason,created_at AS createdAt FROM ideas WHERE moderation_state='pending'
      UNION ALL
      SELECT id,'reply' AS kind,body,display_name AS displayName,moderation_reason AS reason,created_at AS createdAt FROM comments WHERE moderation_state='pending'
      UNION ALL
      SELECT id,'update' AS kind,description || char(10) || char(10) || 'Question: ' || question || char(10) || 'What changed: ' || note AS body,NULL AS displayName,moderation_reason AS reason,created_at AS createdAt FROM idea_updates WHERE moderation_state='pending'
      UNION ALL
      SELECT id,'love' AS kind,body,display_name AS displayName,moderation_reason AS reason,created_at AS createdAt FROM loves WHERE moderation_state='pending'
      ORDER BY createdAt,id LIMIT 100`)
      .all();
    const total = await pendingSubmissionCount();
    await notifyModerators();
    return adminJSON({ items: rows.results, total });
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
      !Object.hasOwn(TABLES, body?.kind) ||
      !['approve', 'dismiss'].includes(body?.action)
    )
      throw new InputError('Choose a submission and review action.');
    const table = TABLES[body.kind as keyof typeof TABLES];
    const state = body.action === 'approve' ? 'visible' : 'hidden';
    const [changed] = await database().batch([
      database()
        .prepare(
          `UPDATE ${table} SET moderation_state=? WHERE id=? AND moderation_state='pending'`,
        )
        .bind(state, body.id),
      auditIfChanged(actor, body.action + '-' + body.kind, body.id),
    ]);
    if (!changed.meta.changes)
      throw new InputError('This submission was already reviewed.', 409);
    return adminJSON({ ok: true });
  } catch (error) {
    return adminFailure(error);
  }
}
