import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createApiHarness } from './helpers/api-harness.mjs';

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
/** Screening that flags any text containing "FLAG" as harassment. */
async function screen(request) {
  const { input } = await request.json();
  const flagged = String(input).includes('FLAG');
  return Response.json({
    results: [
      {
        categories: Object.fromEntries(
          keys.map((k) => [k, flagged && k === 'harassment']),
        ),
        category_scores: Object.fromEntries(
          keys.map((k) => [k, flagged && k === 'harassment' ? 0.99 : 0]),
        ),
      },
    ],
  });
}
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
const love = (body) => ({
  body,
  x: 12.9,
  z: 7,
  landmark: 'silver-lake',
  displayName: '',
  submissionKey: randomUUID(),
});
void test('reported contributions reach moderators, who can hide or dismiss them', async (t) => {
  const site = await createApiHarness({ moderation: screen });
  t.after(() => site.dispose());
  const author = await site.browser();
  const reporter = await site.browser();
  const posted = (
    await author.request('/api/loves', {
      method: 'POST',
      body: love('A love that someone finds hurtful.'),
    })
  ).data.love;
  const report = () =>
    reporter.request('/api/reports', {
      method: 'POST',
      body: { loveId: posted.id, reason: 'Please review this love.' },
    });
  assert.equal((await report()).response.status, 201);
  assert.equal((await report()).response.status, 201);
  assert.equal(
    (await site.db.prepare('SELECT count(*) AS n FROM reports').first()).n,
    1,
    'one report per visitor and target',
  );
  assert.equal(
    (
      await reporter.request('/api/reports', {
        method: 'POST',
        body: { ideaId: 'not-a-uuid', reason: 'x' },
      })
    ).response.status,
    404,
  );
  const cookie = await admin(site);
  assert.equal(
    (await site.request('/api/manage/reports')).response.status,
    401,
  );
  const [item] = (await site.request('/api/manage/reports', { cookie })).data
    .items;
  assert.equal(item.kind, 'love');
  assert.equal(item.id, posted.id);
  assert.equal(item.reports, 1);
  assert.equal(
    (
      await site.request('/api/manage/reports', {
        method: 'POST',
        cookie,
        body: { id: posted.id, kind: 'love', action: 'hide' },
      })
    ).response.status,
    200,
  );
  assert.deepEqual((await site.request('/api/loves')).data.loves, []);
  assert.deepEqual(
    (await site.request('/api/manage/reports', { cookie })).data.items,
    [],
  );
});
