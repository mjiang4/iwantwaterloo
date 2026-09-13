import { database } from '@/db/raw';
import {
  identity,
  response,
  readBody,
  validateIdea,
  failure,
  InputError,
  tagsSQL,
  connectionSQL,
} from '@/lib/server';
import { decodeTags, GROVE_SIZE, type Idea } from '@/lib/garden';
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
        `lower(i.title || ' ' || i.description || ' ' || i.place || ' ' || ${tagsSQL}) LIKE ? ESCAPE '\\'`,
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
    const pageClause = garden
      ? ' AND i.rowid + 5 >= ? AND i.rowid + 5 < ?'
      : '';
    const pageArgs = garden
      ? [page * GROVE_SIZE, (page + 1) * GROVE_SIZE]
      : [page * 50];
    const [rows, count] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT i.id,i.title,i.description,i.category,i.tags,i.rowid + 5 AS plot,i.place,${connectionSQL} AS connection,i.display_name AS displayName,i.created_at AS createdAt,(SELECT count(*) FROM supports s WHERE s.idea_id=i.id) AS waters,(SELECT count(*) FROM comments c WHERE c.idea_id=i.id AND c.moderation_state='visible') AS commentCount,EXISTS(SELECT 1 FROM supports s WHERE s.idea_id=i.id AND s.visitor_id=?) AS watered FROM ideas i WHERE ${clause}${pageClause} ORDER BY ${garden ? 'i.rowid' : order} ${garden ? 'LIMIT 24' : 'LIMIT 50 OFFSET ?'}`,
        )
        .bind(id, ...args, ...pageArgs),
      db
        .prepare(
          `SELECT count(*) AS total,group_concat(DISTINCT cast((i.rowid + 5) / 24 AS integer)) AS grovePages FROM ideas i WHERE ${clause}`,
        )
        .bind(...args),
    ]);
    const ideas = rows.results.map((i) => ({
      ...i,
      tags: decodeTags(i.tags, String(i.category)),
      watered: Boolean(i.watered),
      example: false,
    })) as Idea[];
    const total = Number(count.results[0]?.total || 0);
    const grovePages = String(count.results[0]?.grovePages || '')
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
    const data = validateIdea(await readBody(request)),
      db = database(),
      ideaId = crypto.randomUUID(),
      now = Date.now();
    const { submissionKey, ...fields } = data;
    async function previous() {
      if (!submissionKey) return null;
      const row = await db
        .prepare(
          "SELECT i.id,i.title,i.description,i.category,i.tags,i.place,i.connection,i.display_name AS displayName,i.rowid+5 AS plot,i.created_at AS createdAt,(SELECT count(*) FROM supports WHERE idea_id=i.id) AS waters,(SELECT count(*) FROM comments WHERE idea_id=i.id AND moderation_state='visible') AS commentCount,EXISTS(SELECT 1 FROM supports WHERE idea_id=i.id AND visitor_id=?) AS watered FROM ideas i WHERE submission_key=?",
        )
        .bind(id, submissionKey)
        .first<Record<string, unknown>>();
      if (!row) return null;
      if (
        row.title !== fields.title ||
        row.description !== fields.description ||
        row.category !== fields.category ||
        row.place !== fields.place ||
        row.connection !== fields.connection ||
        row.displayName !== fields.displayName ||
        row.tags !== JSON.stringify(fields.tags)
      )
        throw new InputError(
          'This submission changed. Edit the idea and try again.',
          409,
        );
      return {
        ...row,
        tags: decodeTags(row.tags, String(row.category)),
        watered: Boolean(row.watered),
        example: false,
      };
    }
    const saved = await previous();
    if (saved) return response(request, id, { idea: saved });
    await limitWrites(request, id, 'ideas');
    const result = await db
      .prepare(
        'INSERT INTO ideas (id,title,description,category,tags,place,connection,display_name,created_at,visitor_id,submission_key) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM ideas WHERE visitor_id=? AND created_at>?) < 5 ON CONFLICT(submission_key) DO NOTHING',
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
          plot: Number(result.meta.last_row_id) + 5,
          createdAt: now,
          waters: 0,
          watered: false,
          commentCount: 0,
          example: false,
        },
      },
      201,
    );
  } catch (error) {
    return failure(request, id, error);
  }
}
