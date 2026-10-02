import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';
const keys = [
  'sexual',
  'sexual/minors',
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'violence/graphic',
  'illicit/violent',
  'self-harm/instructions',
];
const result = (scores = {}) =>
  Response.json({
    results: [
      {
        categories: Object.fromEntries(
          keys.map((k) => [k, (scores[k] || 0) > 0.5]),
        ),
        category_scores: Object.fromEntries(
          keys.map((k) => [k, scores[k] || 0]),
        ),
      },
    ],
  });
async function admin(site) {
  const token = randomBytes(32).toString('hex');
  await site.db
    .prepare(
      'INSERT INTO admin_tokens(hash,email,kind,expires_at) VALUES (?,?,?,?)',
    )
    .bind(
      createHash('sha256').update(token).digest('hex'),
      'jerry@unrepped.co',
      'session',
      Date.now() + 60000,
    )
    .run();
  return 'garden_admin_local=' + token;
}
void test('flagged idea is private, retry-stable, and only an admin can publish it', async (t) => {
  let calls = 0;
  const site = await createApiHarness({
    moderation: async (request) => {
      calls++;
      const body = await request.json();
      assert.deepEqual(Object.keys(body).sort(), ['input', 'model']);
      assert.equal(body.model, 'omni-moderation-latest');
      return result({ sexual: 0.99 });
    },
  });
  t.after(() => site.dispose());
  const visitor = await site.browser();
  const payload = ideaPayload();
  const saved = await visitor.request('/api/ideas', {
    method: 'POST',
    body: payload,
  });
  assert.equal(saved.response.status, 201, saved.text);
  assert.equal(saved.data.idea.moderationState, 'pending');
  const id = saved.data.idea.id;
  const retry = await visitor.request('/api/ideas', {
    method: 'POST',
    body: payload,
  });
  assert.equal(retry.data.idea.id, id);
  assert.equal(calls, 1);
  for (const query of ['', '?garden=1', '?mine=1', '?id=' + id])
    assert.equal((await visitor.request('/api/ideas' + query)).data.total, 0);
  assert.equal(
    (await visitor.request('/api/comments?ideaId=' + id)).response.status,
    404,
  );
  assert.equal(
    (
      await visitor.request('/api/support', {
        method: 'PUT',
        body: { ideaId: id, watered: true },
      })
    ).response.status,
    404,
  );
  assert.equal((await site.request('/api/manage/review')).response.status, 401);
  const action = { id, kind: 'idea', action: 'approve' };
  assert.equal(
    (await site.request('/api/manage/review', { method: 'POST', body: action }))
      .response.status,
    401,
  );
  const cookie = await admin(site);
  assert.equal(
    (await site.request('/api/manage/review', { cookie })).data.items.length,
    1,
  );
  assert.equal(
    (
      await site.request('/api/manage/review', {
        method: 'POST',
        cookie,
        body: action,
        requestOrigin: 'https://evil.test',
      })
    ).response.status,
    403,
  );
  assert.equal(
    (
      await site.request('/api/manage/review', {
        method: 'POST',
        cookie,
        body: action,
      })
    ).response.status,
    200,
  );
  assert.equal((await visitor.request('/api/ideas?id=' + id)).data.total, 1);
  assert.equal(
    (await site.request('/api/manage/review', { cookie })).data.items.length,
    0,
  );
});
void test('borderline flags publish; outages and malformed results hold; replies can be reviewed', async (t) => {
  let mode = 'gentle';
  const site = await createApiHarness({
    moderation: () =>
      mode === 'outage'
        ? new Response('', { status: 503 })
        : mode === 'invalid'
          ? Response.json({ results: [] })
          : result({ sexual: mode === 'flagged' ? 0.99 : 0.65 }),
  });
  t.after(() => site.dispose());
  const v = await site.browser();
  const idea = (
    await v.request('/api/ideas', { method: 'POST', body: ideaPayload() })
  ).data.idea;
  assert.equal(idea.moderationState, 'visible');
  mode = 'flagged';
  const body = {
    ideaId: idea.id,
    parentId: '',
    body: 'A sample reply for moderation',
    displayName: '',
    submissionKey: randomUUID(),
  };
  const reply = await v.request('/api/comments', { method: 'POST', body });
  assert.equal(reply.data.comment.moderationState, 'pending');
  assert.equal(
    (await v.request('/api/comments?ideaId=' + idea.id)).data.comments.length,
    0,
  );
  assert.equal(
    (await v.request('/api/comments', { method: 'POST', body })).data.comment
      .id,
    reply.data.comment.id,
  );
  const cookie = await admin(site);
  await site.request('/api/manage/review', {
    method: 'POST',
    cookie,
    body: { id: reply.data.comment.id, kind: 'reply', action: 'approve' },
  });
  assert.equal(
    (await v.request('/api/comments?ideaId=' + idea.id)).data.comments.length,
    1,
  );
  for (const m of ['outage', 'invalid']) {
    mode = m;
    const saved = await v.request('/api/ideas', {
      method: 'POST',
      body: ideaPayload({ description: m + ' idea' }),
    });
    assert.equal(saved.data.idea.moderationState, 'pending');
  }
});
