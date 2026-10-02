import { database } from '@/db/raw';
import { readBody, InputError } from '@/lib/server';
import {
  adminJSON,
  adminFailure,
  requireModerator,
  auditIfChanged,
} from '@/server/admin-auth';
import { IDEA_FROM } from '@/server/idea-records';

/** Reportable kinds and their tables; table names only ever come from this map. */
const TARGETS = {
  idea: { table: 'ideas', column: 'idea_id' },
  reply: { table: 'comments', column: 'comment_id' },
  love: { table: 'loves', column: 'love_id' },
} as const;

/** Visible contributions people reported, most-reported first, with their public text. */
export async function GET(request: Request) {
  try {
    await requireModerator(request);
    const rows = await database()
      .prepare(`
      SELECT 'idea' AS kind,i.id,coalesce(u.title,i.title) || char(10) || char(10) || coalesce(u.description,i.description) AS body,i.display_name AS displayName,
        count(*) AS reports,max(r.created_at) AS reportedAt,
        (SELECT reason FROM reports x WHERE x.idea_id=i.id ORDER BY x.created_at DESC LIMIT 1) AS reason
        ${IDEA_FROM} JOIN reports r ON r.idea_id=i.id WHERE i.moderation_state='visible' GROUP BY i.id
      UNION ALL
      SELECT 'reply',c.id,c.body,c.display_name,count(*),max(r.created_at),
        (SELECT reason FROM reports x WHERE x.comment_id=c.id ORDER BY x.created_at DESC LIMIT 1)
        FROM comments c JOIN reports r ON r.comment_id=c.id WHERE c.moderation_state='visible' GROUP BY c.id
      UNION ALL
      SELECT 'love',l.id,l.body,l.display_name,count(*),max(r.created_at),
        (SELECT reason FROM reports x WHERE x.love_id=l.id ORDER BY x.created_at DESC LIMIT 1)
        FROM loves l JOIN reports r ON r.love_id=l.id WHERE l.moderation_state='visible' GROUP BY l.id
      ORDER BY reports DESC,reportedAt DESC LIMIT 50`)
      .all();
    return adminJSON({ items: rows.results });
  } catch (error) {
    return adminFailure(error);
  }
}

/** Hide a reported contribution, or dismiss its reports and keep it visible. */
export async function POST(request: Request) {
  try {
    const actor = await requireModerator(request);
    const body = await readBody(request);
    if (
      !/^[a-f0-9-]{36}$/.test(body?.id || '') ||
      !Object.hasOwn(TARGETS, body?.kind) ||
      !['hide', 'dismiss'].includes(body?.action)
    )
      throw new InputError('Choose a reported contribution and an action.');
    const { table, column } = TARGETS[body.kind as keyof typeof TARGETS];
    const db = database();
    const statements = [
      body.action === 'hide'
        ? db
            .prepare(
              `UPDATE ${table} SET moderation_state='hidden' WHERE id=? AND moderation_state='visible'`,
            )
            .bind(body.id)
        : db.prepare(`DELETE FROM reports WHERE ${column}=?`).bind(body.id),
      auditIfChanged(actor, body.action + '-reported-' + body.kind, body.id),
    ];
    // Hidden content leaves the report list; its reports are resolved with it.
    if (body.action === 'hide')
      statements.push(
        db.prepare(`DELETE FROM reports WHERE ${column}=?`).bind(body.id),
      );
    const [changed] = await db.batch(statements);
    if (!changed.meta.changes)
      throw new InputError('This report was already handled.', 409);
    return adminJSON({ ok: true });
  } catch (error) {
    return adminFailure(error);
  }
}
