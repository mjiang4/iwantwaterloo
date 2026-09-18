import { database } from '@/db/raw';
import { CATEGORIES, decodeTags, type Idea } from '@/lib/garden';
import { connectionSQL } from '@/lib/server';

/** One projection for lists, retry receipts, and shared idea pages. First bind is the viewer. */
export const IDEA_SELECT = `SELECT
  i.id, i.title, i.description, i.category, i.tags, i.rowid + 5 AS plot,
  i.place, ${connectionSQL} AS connection, i.display_name AS displayName,
  i.created_at AS createdAt,
  (SELECT count(*) FROM supports s WHERE s.idea_id=i.id) AS waters,
  (SELECT count(*) FROM comments c WHERE c.idea_id=i.id AND c.moderation_state='visible') AS commentCount,
  EXISTS(SELECT 1 FROM supports s WHERE s.idea_id=i.id AND s.visitor_id=?) AS watered
  FROM ideas i`;

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
  const category =
    CATEGORIES.find((item) => item.id === row.category)?.id || 'other';
  return {
    id: text(row, 'id'),
    title: text(row, 'title'),
    description: text(row, 'description'),
    category,
    tags: decodeTags(row.tags, category),
    plot: number(row, 'plot'),
    place: text(row, 'place'),
    connection: text(row, 'connection'),
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
    .prepare(IDEA_SELECT + ' WHERE i.id=?')
    .bind(visitorId, id)
    .first<Record<string, unknown>>();
  return row ? ideaFromRow(row) : null;
}
