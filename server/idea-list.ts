import { database } from '@/db/raw';
import { isIdeaPlace } from '@/lib/idea-places';
import { InputError } from '@/lib/server';
import { GROVE_SIZE } from '@/lib/garden';
import { IDEA_SELECT, ideaFromRow } from './idea-records';

/** The list and garden use the same filtering and stable pagination rules. */
export async function listIdeas(url: URL, id: string) {
  const db = database(),
    page = Math.floor(
      Math.max(0, Math.min(100000, Number(url.searchParams.get('page')) || 0)),
    ),
    query = (url.searchParams.get('q') || '').slice(0, 200),
    sort = url.searchParams.get('sort') || 'newest',
    seed =
      Math.abs(
        parseInt((url.searchParams.get('seed') || '0').slice(0, 10), 10) || 0,
      ) % 64,
    garden = url.searchParams.get('garden') === '1';
  // Pending/rejected ideas are hidden from every public read. Moderators use the
  // separate /api/manage/ideas route, which does not apply this filter.
  const where: string[] = ["i.moderation_state = 'visible'"],
    args: (string | number)[] = [];
  if (url.searchParams.get('mine') === '1') {
    where.push('i.visitor_id = ?');
    args.push(id);
  }
  const exactId = url.searchParams.get('id');
  if (exactId) {
    where.push('i.id = ?');
    args.push(exactId.slice(0, 64));
  }
  const place = url.searchParams.get('place') || 'all';
  if (place !== 'all') {
    if (!isIdeaPlace(place)) throw new InputError('Choose a city.');
    where.push("COALESCE(NULLIF(i.place, ''), 'Waterloo') = ?");
    args.push(place);
  }
  for (const term of query.toLowerCase().trim().split(/\s+/).filter(Boolean)) {
    where.push(
      `lower(i.title || ' ' || i.description || ' ' || i.place) LIKE ? ESCAPE '\\'`,
    );
    args.push('%' + term.replace(/[\\%_]/g, '\\$&') + '%');
  }
  const clause = where.join(' AND '),
    order =
      sort === 'watered'
        ? 'waters DESC, i.created_at DESC, i.id'
        : sort === 'random'
          ? // UUIDs supply random bits. Rotating them gives a stable shuffled order
            // across pages and refreshes, without ORDER BY random() duplicating rows.
            `substr(replace(i.id,'-',''),${(seed % 32) + 1}) || substr(replace(i.id,'-',''),1,${seed % 32}) ${seed < 32 ? 'ASC' : 'DESC'}, i.id`
          : 'i.created_at DESC, i.id';
  const pageClause = garden ? ' AND i.rowid + 5 >= ? AND i.rowid + 5 < ?' : '';
  const pageArgs = garden
    ? [page * GROVE_SIZE, (page + 1) * GROVE_SIZE]
    : [page * 50];
  const [rows, count] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `${IDEA_SELECT} WHERE ${clause}${pageClause} ORDER BY ${garden ? 'i.rowid' : order} ${garden ? 'LIMIT ' + GROVE_SIZE : 'LIMIT 50 OFFSET ?'}`,
      )
      .bind(id, ...args, ...pageArgs),
    db
      .prepare(
        `SELECT count(*) AS total,group_concat(DISTINCT cast((i.rowid + 5) / ${GROVE_SIZE} AS integer)) AS grovePages FROM ideas i WHERE ${clause}`,
      )
      .bind(...args),
  ]);
  const ideas = rows.results.map(ideaFromRow);
  const total = Number(count.results[0]?.total || 0);
  const grovePages = (
    typeof count.results[0]?.grovePages === 'string'
      ? count.results[0].grovePages
      : ''
  )
    .split(',')
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
  return {
    ideas,
    total,
    grovePages: grovePages.length ? grovePages : [0],
    examples: [],
    examplesTotal: 0,
    nextPage: !garden && (page + 1) * 50 < total ? page + 1 : null,
  };
}
