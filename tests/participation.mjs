import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';
const post = (body) => ({ method: 'POST', body });
async function fixture(app) {
  const author = await app.browser(),
    helper = await app.browser();
  const payload = ideaPayload({
    question: 'Where could we try this first?',
    displayName: 'Alex, 19, student',
  });
  const planted = await author.request('/api/ideas', post(payload));
  assert.equal(planted.response.status, 201, planted.text);
  const idea = planted.data.idea;
  const contribution = {
    ideaId: idea.id,
    body: 'Movable chairs beside the library would work for groups.',
    displayName: 'Jamie, resident',
    kind: 'place',
    source: 'share',
    submissionKey: randomUUID(),
  };
  const reply = await helper.request('/api/comments', post(contribution));
  assert.equal(reply.response.status, 201, reply.text);
  const update = {
    ideaId: idea.id,
    version: 0,
    description:
      'Let’s try movable chairs beside the library for an afternoon.',
    question: 'Who could help test the first afternoon?',
    note: 'Added the library location and movable chairs from Jamie’s suggestion.',
    credits: [reply.data.comment.id],
    submissionKey: randomUUID(),
  };
  return {
    author,
    helper,
    idea,
    update,
    payload,
    contribution,
    comment: reply.data.comment,
  };
}
void test('author updates are owned, atomic, retry-safe, credited, and preserve the original', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const f = await fixture(app);
  assert.equal(
    (await f.helper.request('/api/activity', post(f.update))).response.status,
    403,
  );
  assert.equal(
    (
      await f.author.request('/api/activity', {
        ...post(f.update),
        requestOrigin: 'https://elsewhere.test',
      })
    ).response.status,
    403,
  );
  const replies = await Promise.all(
    Array.from({ length: 4 }, () =>
      f.author.request('/api/activity', post(f.update)),
    ),
  );
  for (const r of replies) {
    assert.equal(r.response.status, 200, r.text);
    assert.equal(r.data.idea.version, 1);
    assert.equal(r.data.idea.creditedCount, 1);
    assert.equal(r.data.idea.owned, true);
  }
  const history = await app.request('/api/activity?ideaId=' + f.idea.id);
  assert.equal(history.data.activities.length, 1);
  assert.equal(history.data.original.description, f.payload.description);
  assert.equal(
    history.data.activities[0].credits[0].displayName,
    'Jamie, resident',
  );
  assert.equal(history.data.activities[0].credits[0].body, f.contribution.body);
  assert.equal(
    (await f.author.request('/api/ideas', post(f.payload))).response.status,
    200,
    'retry the original after editing',
  );
  assert.equal(
    (
      await f.author.request(
        '/api/activity',
        post({ ...f.update, submissionKey: randomUUID() }),
      )
    ).response.status,
    409,
    'stale tab',
  );
  assert.equal(
    (
      await f.author.request(
        '/api/activity',
        post({ ...f.update, note: 'This content changed.' }),
      )
    ).response.status,
    409,
    'same key different body',
  );
  const publicIdea = (await app.request('/api/ideas?id=' + f.idea.id)).data
    .ideas[0];
  assert.equal(publicIdea.owned, false);
  assert.equal(publicIdea.description, f.update.description);
  assert.equal(publicIdea.question, f.update.question);
  assert.equal(Object.hasOwn(publicIdea, 'visitorId'), false);
  const comments = (await app.request('/api/comments?ideaId=' + f.idea.id)).data
    .comments;
  assert.equal(comments[0].incorporated, 1);
  assert.equal(
    (await app.request('/api/ideas?q=movable')).data.ideas.length,
    1,
    'search uses revised proposal',
  );
  const staleConcurrent = {
    ...f.update,
    version: 1,
    credits: [],
    submissionKey: randomUUID(),
    note: 'A second revision with a smaller pilot.',
  };
  const race = await Promise.all([
    f.author.request('/api/activity', post(staleConcurrent)),
    f.author.request(
      '/api/activity',
      post({
        ...staleConcurrent,
        submissionKey: randomUUID(),
        note: 'A competing tab with a different plan.',
      }),
    ),
  ]);
  assert.deepEqual(
    race.map((r) => r.response.status).sort((a, b) => a - b),
    [200, 409],
  );
});
void test('credit cannot cross ideas, credit oneself, or expose a hidden contribution', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const f = await fixture(app);
  const other = (await f.author.request('/api/ideas', post(ideaPayload()))).data
    .idea;
  const wrong = (
    await f.helper.request(
      '/api/comments',
      post({
        ...f.contribution,
        ideaId: other.id,
        submissionKey: randomUUID(),
      }),
    )
  ).data.comment;
  for (const credits of [[wrong.id], [randomUUID()]])
    assert.equal(
      (
        await f.author.request(
          '/api/activity',
          post({ ...f.update, credits, submissionKey: randomUUID() }),
        )
      ).response.status,
      409,
    );
  const self = (
    await f.author.request(
      '/api/comments',
      post({ ...f.contribution, submissionKey: randomUUID() }),
    )
  ).data.comment;
  assert.equal(
    (
      await f.author.request(
        '/api/activity',
        post({ ...f.update, credits: [self.id], submissionKey: randomUUID() }),
      )
    ).response.status,
    409,
  );
  assert.equal(
    (await f.author.request('/api/activity', post(f.update))).response.status,
    200,
  );
  await app.db
    .prepare("UPDATE comments SET moderation_state='hidden' WHERE id=?")
    .bind(f.comment.id)
    .run();
  const history = (await app.request('/api/activity?ideaId=' + f.idea.id)).data;
  assert.deepEqual(history.activities[0].credits, []);
  assert.equal(
    (await app.request('/api/ideas?id=' + f.idea.id)).data.ideas[0]
      .creditedCount,
    0,
  );
  assert.equal(
    (
      await f.author.request(
        '/api/activity',
        post({ ...f.update, version: 1, submissionKey: randomUUID() }),
      )
    ).response.status,
    409,
  );
});
void test('organizer review queue is authenticated, preserves responses, and measures real participation', async (t) => {
  const app = await createApiHarness({ preview: true });
  t.after(() => app.dispose());
  const f = await fixture(app);
  assert.equal((await app.request('/api/admin/reviews')).response.status, 401);
  const review = {
    ideaId: f.idea.id,
    body: 'I will ask the library about trying movable chairs for one afternoon.',
    status: 'needs-help',
    submissionKey: randomUUID(),
  };
  assert.equal(
    (await f.helper.request('/api/admin/reviews', post(review))).response
      .status,
    401,
  );
  const login = await app.request(
    '/api/admin/session',
    post({ key: app.secret }),
  );
  assert.equal(login.response.status, 200, login.text);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const r = await app.request('/api/admin/reviews', {
    ...post(review),
    cookie,
  });
  assert.equal(r.response.status, 200, r.text);
  assert.equal(
    (await app.request('/api/admin/reviews', { ...post(review), cookie }))
      .response.status,
    200,
  );
  assert.equal(
    (await f.author.request('/api/activity', post(f.update))).response.status,
    200,
  );
  const metrics = (await app.request('/api/admin/reviews', { cookie })).data
    .metrics;
  assert.equal(metrics.reviewedThisWeek, 1);
  assert.equal(metrics.ideasWithContributions, 1);
  assert.equal(metrics.creditedContributions, 1);
  assert.equal(metrics.developedIdeas, 1);
  assert.equal(metrics.sharedContributions, 1);
  assert.equal(metrics.returningAuthors, 0);
  const idea = (await app.request('/api/ideas?id=' + f.idea.id)).data.ideas[0];
  assert.equal(idea.reviewStatus, 'needs-help');
  assert.equal(idea.reviewCount, 1);
  const events = (await app.request('/api/activity?ideaId=' + f.idea.id)).data
    .activities;
  assert.equal(events.filter((r) => r.kind === 'organizer').length, 1);
  assert.equal(
    (
      await app.request('/api/admin/reviews', {
        ...post({
          ...review,
          body: 'A different response with the same retry key.',
        }),
        cookie,
      })
    ).response.status,
    409,
  );
  const before = await app.db
    .prepare('SELECT count(*) AS n FROM idea_updates')
    .first();
  await app.request('/api/admin/scenario', {
    ...post({ key: randomUUID(), action: 'scenario', scenario: 'sample' }),
    cookie,
  });
  await app.request('/api/admin/scenario', {
    ...post({ key: randomUUID(), action: 'undo' }),
    cookie,
  });
  assert.equal(
    (await app.db.prepare('SELECT count(*) AS n FROM idea_updates').first()).n,
    before.n,
    'preview undo preserves revision history',
  );
  assert.equal(
    (await app.request('/api/ideas?id=' + f.idea.id)).data.ideas[0].question,
    f.update.question,
  );
  const production = await createApiHarness();
  t.after(() => production.dispose());
  assert.equal(
    (await production.request('/api/admin/reviews')).response.status,
    404,
  );
});
void test('discovery interleaves untouched, contributed, and progressing ideas without popularity bias', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const f = await fixture(app);
  await f.author.request('/api/activity', post(f.update));
  const unreviewed = (await f.author.request('/api/ideas', post(ideaPayload())))
    .data.idea;
  await f.helper.request(
    '/api/comments',
    post({
      ...f.contribution,
      ideaId: unreviewed.id,
      submissionKey: randomUUID(),
    }),
  );
  const fresh = (await f.author.request('/api/ideas', post(ideaPayload()))).data
    .idea;
  for (let i = 0; i < 55; i++)
    await app.db
      .prepare(
        'INSERT INTO ideas(id,title,description,category,created_at,visitor_id) VALUES (?,?,?,?,?,?)',
      )
      .bind(
        randomUUID(),
        'Fresh idea ' + i,
        'A new idea with some detail',
        'other',
        Date.now() + i,
        'fixture',
      )
      .run();
  const read = async (sort) =>
    (await app.request('/api/ideas?sort=' + sort)).data;
  const discovery = await read('discover');
  assert.ok(discovery.ideas.slice(0, 3).some((i) => i.id === f.idea.id));
  assert.ok(discovery.ideas.slice(0, 3).some((i) => i.id === unreviewed.id));
  const next = (await app.request('/api/ideas?sort=discover&page=1')).data;
  assert.equal(
    new Set([...discovery.ideas, ...next.ideas].map((i) => i.id)).size,
    58,
  );
  assert.deepEqual(
    (await read('discover')).ideas.map((i) => i.id),
    discovery.ideas.map((i) => i.id),
  );
  assert.equal((await read('progress')).ideas[0].id, f.idea.id);
  assert.ok(!(await read('needs-input')).ideas.some((i) => i.id === f.idea.id));
  assert.ok((await read('newest')).total > 0);
  assert.ok(fresh.id);
});
