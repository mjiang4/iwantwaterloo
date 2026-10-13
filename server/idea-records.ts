import { database } from '@/db/raw';
import type { Idea } from '@/lib/garden';

/**
 * Current proposal plus immutable original row, shared by all public reads. Only
 * screened (visible) author updates ever replace the public text.
 */
export const IDEA_FROM = `FROM ideas i LEFT JOIN idea_updates u ON u.idea_id=i.id
  AND u.version=(SELECT max(v.version) FROM idea_updates v WHERE v.idea_id=i.id AND v.moderation_state='visible')`;
export const PROGRESS_SQL = `(coalesce(u.version,0)>0 OR EXISTS(SELECT 1 FROM organizer_reviews r WHERE r.idea_id=i.id))`;
export const EXTERNAL_INPUT_SQL = `EXISTS(SELECT 1 FROM comments c WHERE c.idea_id=i.id AND c.visitor_id!=i.visitor_id AND c.moderation_state='visible')`;
/**
 * One projection for lists, retry receipts, and shared idea pages. Exactly one
 * parameter: the viewer. Never expose the ownership cookie.
 */
export const IDEA_SELECT = `WITH viewer AS (SELECT ? AS id) SELECT
  i.moderation_state AS moderationState, i.id,
  coalesce(u.title,i.title) AS title, coalesce(u.description,i.description) AS description,
  coalesce(u.question,i.question) AS question, coalesce(u.version,0) AS version,
  i.rowid + 5 AS plot, i.place, i.display_name AS displayName,
  i.created_at AS createdAt, i.visitor_id=(SELECT id FROM viewer) AS owned,
  (SELECT count(*) FROM supports s WHERE s.idea_id=i.id) AS waters,
  (SELECT count(*) FROM comments c WHERE c.idea_id=i.id AND c.moderation_state='visible') AS commentCount,
  (SELECT count(*) FROM comments c WHERE c.idea_id=i.id AND c.moderation_state='visible'
    AND EXISTS(SELECT 1 FROM idea_updates v,json_each(v.credits) credit WHERE v.idea_id=i.id AND v.moderation_state='visible' AND credit.value=c.id)) AS creditedCount,
  (SELECT count(*) FROM organizer_reviews r WHERE r.idea_id=i.id) AS reviewCount,
  (SELECT status FROM organizer_reviews r WHERE r.idea_id=i.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS reviewStatus,
  EXISTS(SELECT 1 FROM supports s WHERE s.idea_id=i.id AND s.visitor_id=(SELECT id FROM viewer)) AS watered
  ${IDEA_FROM}`;

function text(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'string') throw new Error('Invalid idea field: ' + key);
  return value;
}
function number(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid idea field: ' + key);
  return value;
}

/** Database nulls and SQLite booleans never escape into the browser contract. */
export function ideaFromRow(row: Record<string, unknown>): Idea {
  return {
    id: text(row, 'id'),
    moderationState: row.moderationState === 'visible' ? 'visible' : 'pending',
    title: text(row, 'title'),
    description: text(row, 'description'),
    question: text(row, 'question'),
    owned: Boolean(row.owned),
    version: number(row, 'version'),
    creditedCount: number(row, 'creditedCount'),
    reviewCount: number(row, 'reviewCount'),
    reviewStatus:
      typeof row.reviewStatus === 'string' ? row.reviewStatus : undefined,
    plot: number(row, 'plot'),
    place: text(row, 'place'),
    displayName:
      typeof row.displayName === 'string' ? row.displayName : undefined,
    createdAt: number(row, 'createdAt'),
    waters: number(row, 'waters'),
    watered: Boolean(row.watered),
    commentCount: number(row, 'commentCount'),
    example: false,
  };
}
export async function findIdea(id: string, visitorId = '') {
  const row = await database()
    .prepare(IDEA_SELECT + " WHERE i.id=? AND i.moderation_state='visible'")
    .bind(visitorId, id)
    .first<Record<string, unknown>>();
  return row ? ideaFromRow(row) : null;
}
