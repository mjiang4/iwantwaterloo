import { database } from '@/db/raw';
import {
  identity,
  requireVisitor,
  response,
  readBody,
  validateIdea,
  failure,
  InputError,
  tagsSQL,
  connectionSQL,
} from '@/lib/server';
import { GROVE_SIZE } from '@/lib/garden';
import {
  IDEA_SELECT,
  IDEA_FROM,
  PROGRESS_SQL,
  EXTERNAL_INPUT_SQL,
  findIdea,
  ideaFromRow,
} from '@/server/idea-records';
import { limitWrites } from '@/lib/rate-limit';
export async function GET(request: Request) {
  const { id } = identity(request);
  try {
    const db = database(),
      url = new URL(request.url),
      page = Math.floor(
        Math.max(
          0,
          Math.min(100000, Number(url.searchParams.get('page')) || 0),
        ),
      ),
      category = url.searchParams.get('category') || 'all',
      query = (url.searchParams.get('q') || '').slice(0, 200),
      connection = url.searchParams.get('connection') || 'all',
      sort = url.searchParams.get('sort') || 'newest',
      seed =
        Math.abs(
          parseInt((url.searchParams.get('seed') || '0').slice(0, 10), 10) || 0,
        ) % 64,
      tag = url.searchParams.get('tag') || 'all',
      garden = url.searchParams.get('garden') === '1';
    const where: string[] = ['1=1'],
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
    if (category !== 'all') {
      where.push('i.category = ?');
      args.push(category);
    }
    if (connection !== 'all') {
      where.push(`${connectionSQL} = ?`);
      args.push(connection);
    }
    if (tag !== 'all') {
      where.push(
        `EXISTS (SELECT 1 FROM json_each(${tagsSQL}) t WHERE t.value=?)`,
      );
      args.push(tag);
    }
    for (const term of query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean)) {
      where.push(
        `lower(coalesce(u.title,i.title) || ' ' || coalesce(u.description,i.description) || ' ' || i.place || ' ' || ${tagsSQL}) LIKE ? ESCAPE '\\'`,
      );
      args.push('%' + term.replace(/[\\%_]/g, '\\$&') + '%');
    }
    if (!garden && sort === 'needs-input') where.push(`NOT ${PROGRESS_SQL}`);
    if (!garden && sort === 'progress') where.push(PROGRESS_SQL);
    const lane = `CASE WHEN ${PROGRESS_SQL} THEN 2 WHEN ${EXTERNAL_INPUT_SQL} THEN 1 ELSE 0 END`;
    const day = Math.floor(Date.now() / 86400000) % 32;
    const fairOrder = `row_number() OVER (PARTITION BY ${lane} ORDER BY CASE WHEN ${lane}=0 THEN i.created_at END DESC, substr(replace(i.id,'-',''),${day + 1}) || substr(replace(i.id,'-',''),1,${day}),i.id), (${lane}+${day}) % 3, i.id`;
    const clause = where.join(' AND '),
      order =
        sort === 'discover'
          ? fairOrder
          : sort === 'watered'
            ? 'waters DESC, i.created_at DESC, i.id'
            : sort === 'random'
              ? // UUIDs supply random bits. Rotating them gives a stable shuffled order
                // across pages and refreshes, without ORDER BY random() duplicating rows.
                `substr(replace(i.id,'-',''),${(seed % 32) + 1}) || substr(replace(i.id,'-',''),1,${seed % 32}) ${seed < 32 ? 'ASC' : 'DESC'}, i.id`
              : 'i.created_at DESC, i.id';
    const pageClause = garden
      ? ' AND i.rowid + 5 >= ? AND i.rowid + 5 < ?'
      : '';
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
          `SELECT count(*) AS total,group_concat(DISTINCT cast((i.rowid + 5) / ${GROVE_SIZE} AS integer)) AS grovePages ${IDEA_FROM} WHERE ${clause}`,
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
    return response(request, id, {
      ideas,
      total,
      grovePages: grovePages.length ? grovePages : [0],
      examples: [],
      examplesTotal: 0,
      nextPage: !garden && (page + 1) * 50 < total ? page + 1 : null,
    });
  } catch (error) {
    return failure(request, id, error);
  }
}
export async function POST(request: Request) {
  const { id } = identity(request);
  try {
    requireVisitor(request);
    const data = validateIdea(await readBody(request)),
      db = database(),
      ideaId = crypto.randomUUID(),
      now = Date.now();
    const { submissionKey, ...fields } = data;
    async function previous() {
      if (!submissionKey) return null;
      const original = await db
        .prepare('SELECT * FROM ideas WHERE submission_key=?')
        .bind(submissionKey)
        .first();
      if (!original) return null;
      if (
        original.visitor_id !== id ||
        original.title !== fields.title ||
        original.description !== fields.description ||
        original.question !== fields.question ||
        original.category !== fields.category ||
        original.place !== fields.place ||
        original.connection !== fields.connection ||
        original.display_name !== fields.displayName ||
        original.tags !== JSON.stringify(fields.tags)
      )
        throw new InputError(
          'This submission changed. Edit the idea and try again.',
          409,
        );
      return findIdea(String(original.id), id);
    }

    const saved = await previous();
    if (saved) return response(request, id, { idea: saved });
    await limitWrites(request, id, 'ideas');
    const result = await db
      .prepare(
        'INSERT INTO ideas (id,title,description,category,tags,place,connection,display_name,question,created_at,visitor_id,submission_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM ideas WHERE visitor_id=? AND created_at>?) < 5 ON CONFLICT(submission_key) DO NOTHING',
      )
      .bind(
        ideaId,
        fields.title,
        fields.description,
        fields.category,
        JSON.stringify(fields.tags),
        fields.place,
        fields.connection,
        fields.displayName,
        fields.question,
        now,
        id,
        submissionKey,
        id,
        now - 600000,
      )
      .run();
    if (!result.meta.changes) {
      const saved = await previous();
      if (saved) return response(request, id, { idea: saved });
      throw new InputError(
        'You’ve shared a few ideas. Try again in 10 minutes.',
        429,
        600,
      );
    }
    return response(
      request,
      id,
      {
        idea: {
          id: ideaId,
          ...fields,
          displayName: fields.displayName || undefined,
          plot: Number(result.meta.last_row_id) + 5,
          createdAt: now,
          waters: 0,
          watered: false,
          commentCount: 0,
          owned: true,
          version: 0,
          creditedCount: 0,
          reviewCount: 0,
          example: false,
        },
      },
      201,
    );
  } catch (error) {
    return failure(request, id, error);
  }
}
