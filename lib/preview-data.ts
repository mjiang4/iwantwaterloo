import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { InputError } from '@/lib/server';
const columns = {
  ideas: [
    'rowid',
    'id',
    'title',
    'description',
    'category',
    'tags',
    'place',
    'connection',
    'display_name',
    'created_at',
    'visitor_id',
    'submission_key',
  ],
  comments: [
    'id',
    'idea_id',
    'parent_id',
    'body',
    'display_name',
    'created_at',
    'visitor_id',
    'submission_key',
    'moderation_state',
  ],
  supports: ['idea_id', 'visitor_id', 'created_at'],
  reports: [
    'id',
    'idea_id',
    'comment_id',
    'reason',
    'visitor_id',
    'created_at',
  ],
} as const;
export type Scenario = 'empty' | 'sample' | 'full' | 'busy';
export const scenarioNames = {
  empty: 'Empty garden',
  sample: 'A few ideas',
  full: 'Full grove',
  busy: 'Busy garden',
};
export async function previewStatus() {
  const db = database();
  const [counts, ideas, snapshot, checks] = await db.batch<
    Record<string, unknown>
  >([
    db.prepare(
      'SELECT (SELECT count(*) FROM ideas) ideas,(SELECT count(*) FROM supports) likes,(SELECT count(*) FROM comments) replies',
    ),
    db.prepare(
      'SELECT id,title,(SELECT count(*) FROM supports s WHERE s.idea_id=i.id) likes FROM ideas i ORDER BY i.created_at DESC LIMIT 100',
    ),
    db.prepare('SELECT created_at FROM preview_snapshots WHERE id=1'),
    db.prepare(
      'SELECT id,status,created_at,results FROM preview_checks ORDER BY created_at DESC LIMIT 1',
    ),
  ]);
  let build: Record<string, unknown> = {};
  try {
    build = JSON.parse(env.PREVIEW_BUILD || '{}');
  } catch {}
  const latest = checks.results[0];
  const builtAt = Date.parse(String(build.builtAt || ''));
  const currentCheck =
    latest &&
    (!Number.isFinite(builtAt) || Number(latest.created_at) >= builtAt);
  return {
    environment: 'preview',
    authMode: env.PREVIEW_AUTH === 'sites-owner' ? 'sites-owner' : 'key',
    build,
    counts: counts.results[0],
    ideas: ideas.results,
    canUndo: !!snapshot.results.length,
    checks: currentCheck
      ? {
          ...latest,
          status:
            latest.status === 'running' &&
            Number(latest.created_at) < Date.now() - 120000
              ? 'interrupted'
              : latest.status,
          results: JSON.parse(String(latest.results)),
        }
      : null,
  };
}
function snapshotSQL(fresh: string) {
  const values = Object.entries(columns)
    .map(
      ([table, cols]) =>
        `'${table}',json((SELECT json_group_array(json_object(${cols.map((c) => `'${c}',${c}`).join(',')})) FROM ${table}))`,
    )
    .join(',');
  return database()
    .prepare(
      `INSERT OR REPLACE INTO preview_snapshots(id,payload,created_at) SELECT 1,json_object(${values}),? WHERE ${fresh}`,
    )
    .bind(Date.now());
}
function fixtures(scenario: Scenario) {
  const titles = [
    'A library open late',
    'More homes near the ION',
    'A shaded walk to school',
    'Places to make things',
    'A lively public square',
    'Somewhere to sit by the water',
    'Safe cycling for everyone',
    'More community gardens',
  ];
  const tags = [
    'learning',
    'housing',
    'public-spaces',
    'arts',
    'small-business',
    'parks',
    'cycling',
    'parks',
  ];
  const connections = [
    'From Waterloo',
    'Studying in Waterloo',
    'Interested from elsewhere',
  ];
  const count =
      scenario === 'empty'
        ? 0
        : scenario === 'sample'
          ? 8
          : scenario === 'full'
            ? 24
            : 72,
    now = Date.now();
  const ideas = Array.from({ length: count }, (_, i) => ({
    rowid: 19 + i,
    id: crypto.randomUUID(),
    title: titles[i % 8] + (i >= 8 ? ` · ${i + 1}` : ''),
    description:
      'A sample idea for this preview. Try opening it, liking it, or adding a reply.',
    category: 'other',
    tags: JSON.stringify([tags[i % 8]]),
    place: '',
    connection: connections[i % 3],
    display_name: i % 3 === 0 ? 'River' : null,
    created_at: now - i * 60000,
    visitor_id: 'preview-fixture',
    submission_key: crypto.randomUUID(),
  }));
  const supports = ideas.flatMap((idea, i) =>
    Array.from(
      {
        length: scenario === 'full' ? 25 : [0, 1, 3, 9, 10, 24, 25, 25][i % 8],
      },
      (_, n) => ({
        idea_id: idea.id,
        visitor_id: `preview-support-${n}`,
        created_at: now,
      }),
    ),
  );
  const comments: Record<string, unknown>[] = [];
  if (ideas.length) {
    const parent = crypto.randomUUID();
    comments.push(
      {
        id: parent,
        idea_id: ideas[0].id,
        parent_id: null,
        body: 'Could this start near the library?',
        display_name: 'Alex',
        created_at: now,
        visitor_id: 'preview-fixture',
        submission_key: crypto.randomUUID(),
        moderation_state: 'visible',
      },
      {
        id: crypto.randomUUID(),
        idea_id: ideas[0].id,
        parent_id: parent,
        body: 'An evening pilot would help us try it out.',
        display_name: null,
        created_at: now + 1,
        visitor_id: 'preview-fixture',
        submission_key: crypto.randomUUID(),
        moderation_state: 'visible',
      },
    );
  }
  return { ideas, comments, supports };
}
export async function changePreview(raw: unknown) {
  if (!raw || typeof raw !== 'object')
    throw new InputError('Choose a test action.');
  const body = raw as Record<string, unknown>,
    key = body.key;
  if (typeof key !== 'string' || !/^[a-f0-9-]{36}$/.test(key))
    throw new InputError('Please retry this action.');
  const db = database(),
    action = body.action;
  if (!['scenario', 'likes', 'undo'].includes(String(action)))
    throw new InputError('Choose a test action.');
  if (
    action === 'scenario' &&
    !Object.hasOwn(scenarioNames, String(body.scenario))
  )
    throw new InputError('Choose a garden.');
  if (
    action === 'likes' &&
    (typeof body.ideaId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(body.ideaId) ||
      !Number.isInteger(body.likes) ||
      Number(body.likes) < 0 ||
      Number(body.likes) > 100)
  )
    throw new InputError('Choose 0–100 likes.');
  const signature = JSON.stringify({
    action,
    scenario: body.scenario,
    ideaId: body.ideaId,
    likes: body.likes,
  });
  const previous = await db
    .prepare('SELECT action FROM preview_operations WHERE id=?')
    .bind(key)
    .first<{ action: string }>();
  if (previous) {
    if (previous.action !== signature)
      throw new InputError('This action changed. Please try again.', 409);
    return;
  }
  if (
    await db
      .prepare(
        "SELECT id FROM preview_checks WHERE status='running' AND created_at>?",
      )
      .bind(Date.now() - 120000)
      .first()
  )
    throw new InputError('Wait for the browser checks to finish.', 409);
  if (
    action === 'likes' &&
    !(await db
      .prepare('SELECT id FROM ideas WHERE id=?')
      .bind(body.ideaId)
      .first())
  )
    throw new InputError('That idea is no longer in this preview.', 404);
  if (
    action === 'undo' &&
    !(await db.prepare('SELECT id FROM preview_snapshots WHERE id=1').first())
  )
    throw new InputError('There is nothing to undo.', 409);
  // The operation receipt makes retrying a lost response harmless. All changes are one D1 transaction.
  const fresh = `NOT EXISTS(SELECT 1 FROM preview_operations WHERE id='${key}')${action === 'undo' ? ' AND EXISTS(SELECT 1 FROM preview_snapshots WHERE id=1)' : action === 'likes' ? ` AND EXISTS(SELECT 1 FROM ideas WHERE id='${body.ideaId}')` : ''}`;
  const statements: D1PreparedStatement[] = [];
  if (action !== 'undo') statements.push(snapshotSQL(fresh));
  if (action === 'scenario' || action === 'undo')
    for (const table of ['reports', 'comments', 'supports', 'ideas'])
      statements.push(db.prepare(`DELETE FROM ${table} WHERE ${fresh}`));
  if (action === 'scenario') {
    const data = fixtures(body.scenario as Scenario);
    for (const table of ['ideas', 'supports', 'comments'] as const) {
      const cols = columns[table];
      statements.push(
        db
          .prepare(
            `INSERT INTO ${table}(${cols.join(',')}) SELECT ${cols.map((c) => `json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE ${fresh}`,
          )
          .bind(JSON.stringify(data[table])),
      );
    }
  }
  if (action === 'likes') {
    statements.push(
      db
        .prepare(`DELETE FROM supports WHERE idea_id=? AND ${fresh}`)
        .bind(body.ideaId),
    );
    const people = Array.from(
      { length: Number(body.likes) },
      (_, i) => `preview-support-${i}`,
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO supports(idea_id,visitor_id,created_at) SELECT ?,value,? FROM json_each(?) WHERE ${fresh}`,
        )
        .bind(body.ideaId, Date.now(), JSON.stringify(people)),
    );
  }
  if (action === 'undo') {
    for (const [table, cols] of Object.entries(columns))
      statements.push(
        db.prepare(
          `INSERT INTO ${table}(${cols.join(',')}) SELECT ${cols.map((c) => `json_extract(value,'$.${c}')`).join(',')} FROM json_each((SELECT payload FROM preview_snapshots WHERE id=1),'$.${table}') WHERE ${fresh}`,
        ),
      );
    statements.push(
      db.prepare(`DELETE FROM preview_snapshots WHERE id=1 AND ${fresh}`),
    );
  }
  statements.push(
    db
      .prepare(
        'INSERT OR IGNORE INTO preview_operations(id,action,created_at) VALUES (?,?,?)',
      )
      .bind(key, signature, Date.now()),
  );
  await db.batch(statements);
}
