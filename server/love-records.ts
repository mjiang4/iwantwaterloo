import { database } from '@/db/raw';
import type { Love } from '@/features/loves/model';

/** Exactly one parameter: the viewer. Never expose the ownership cookie. */
export const LOVE_SELECT = `WITH viewer AS (SELECT ? AS id) SELECT
  l.id, l.moderation_state AS moderationState, l.body, l.x, l.z, l.landmark, l.display_name AS displayName,
  l.created_at AS createdAt, l.visitor_id=(SELECT id FROM viewer) AS owned,
  (SELECT count(*) FROM love_echoes e WHERE e.love_id=l.id) AS echoes,
  EXISTS(SELECT 1 FROM love_echoes e WHERE e.love_id=l.id AND e.visitor_id=(SELECT id FROM viewer)) AS echoed
  FROM loves l`;

function text(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'string') throw new Error('Invalid love field: ' + key);
  return value;
}
function number(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid love field: ' + key);
  return value;
}

/** Database nulls and SQLite booleans never escape into the browser contract. */
export function loveFromRow(row: Record<string, unknown>): Love {
  return {
    id: text(row, 'id'),
    // Public loves are always visible; only an author's own receipt says otherwise.
    ...(row.moderationState !== 'visible' && {
      moderationState: 'pending' as const,
    }),
    body: text(row, 'body'),
    x: number(row, 'x'),
    z: number(row, 'z'),
    landmark: typeof row.landmark === 'string' ? row.landmark : undefined,
    displayName:
      typeof row.displayName === 'string' ? row.displayName : undefined,
    createdAt: number(row, 'createdAt'),
    echoes: number(row, 'echoes'),
    echoed: Boolean(row.echoed),
    owned: Boolean(row.owned),
  };
}
export async function listLoves(visitorId: string) {
  const { results } = await database()
    .prepare(
      LOVE_SELECT +
        " WHERE l.moderation_state='visible' ORDER BY l.created_at DESC, l.id LIMIT 200",
    )
    .bind(visitorId)
    .all<Record<string, unknown>>();
  return results.map(loveFromRow);
}
/** Any moderation state, but only the author's own love: answers their retry. */
export async function findLove(id: string, visitorId: string) {
  const row = await database()
    .prepare(LOVE_SELECT + ' WHERE l.id=? AND l.visitor_id=?')
    .bind(visitorId, id, visitorId)
    .first<Record<string, unknown>>();
  return row ? loveFromRow(row) : null;
}
