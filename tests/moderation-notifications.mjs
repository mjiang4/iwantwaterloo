import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';
async function admin(app) {
  const token = randomBytes(32).toString('hex');
  await app.db
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
const moderation = () => new Response('', { status: 503 });
void test('alerts are disabled until enabled, and total includes items beyond the first page', async (t) => {
  let sent = 0;
  const app = await createApiHarness({
    moderation,
    emailDelivery: () => {
      sent++;
      return Response.json({ id: 'test' });
    },
  });
  t.after(() => app.dispose());
  await app.db.batch(
    Array.from({ length: 101 }, (_, i) =>
      app.db
        .prepare(
          "INSERT INTO ideas(id,title,description,category,created_at,visitor_id,moderation_state) VALUES (?,?,?,'other',?,'test','pending')",
        )
        .bind(randomUUID(), 'Test', 'Held ' + i, i),
    ),
  );
  const visitor = await app.browser();
  await visitor.request('/api/ideas', { method: 'POST', body: ideaPayload() });
  const queue = await app.request('/api/manage/review', {
    cookie: await admin(app),
  });
  assert.equal(queue.data.total, 102);
  assert.equal(queue.data.items.length, 100);
  assert.equal(sent, 0);
  assert.equal((await app.request('/api/manage/review')).response.status, 401);
});
void test('concurrent held submissions send one private alert to each approved admin, then throttle', async (t) => {
  const sent = [];
  const app = await createApiHarness({
    moderation,
    moderationAlerts: true,
    emailDelivery: async (r) => {
      sent.push({
        body: await r.json(),
        key: r.headers.get('Idempotency-Key'),
      });
      return Response.json({ id: 'test' });
    },
  });
  t.after(() => app.dispose());
  await app.db
    .prepare(
      'INSERT INTO garden_admins(email,added_by,created_at) VALUES (?,?,?)',
    )
    .bind('reviewer@example.test', 'test', Date.now())
    .run();
  const visitors = await Promise.all([app.browser(), app.browser()]);
  const saved = await Promise.all(
    visitors.map((v) =>
      v.request('/api/ideas', {
        method: 'POST',
        body: ideaPayload({
          description: 'Private submitted text must stay out of email',
        }),
      }),
    ),
  );
  assert.ok(saved.every((s) => s.response.status === 201));
  assert.deepEqual(
    sent.map((s) => s.body.to[0]).sort((a, b) => a.localeCompare(b)),
    ['jerry@akatos.com', 'jerry@unrepped.co', 'reviewer@example.test'],
  );
  for (const mail of sent) {
    assert.equal(mail.body.to.length, 1);
    assert.ok(!mail.body.text.includes('Private submitted'));
    assert.ok(mail.body.text.includes('https://garden.example.test/admin'));
  }
  await app.request('/api/manage/review', { cookie: await admin(app) });
  assert.equal(sent.length, 3);
});
void test('email failure preserves submission and retries with stable per-recipient idempotency keys', async (t) => {
  let fail = true;
  const sent = [];
  const app = await createApiHarness({
    moderation,
    moderationAlerts: true,
    emailDelivery: async (r) => {
      sent.push({
        body: await r.json(),
        key: r.headers.get('Idempotency-Key'),
      });
      return Response.json({}, { status: fail ? 503 : 200 });
    },
  });
  t.after(() => app.dispose());
  const v = await app.browser();
  const saved = await v.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
  });
  assert.equal(saved.response.status, 201);
  assert.equal(saved.data.idea.moderationState, 'pending');
  fail = false;
  await app.db
    .prepare(
      "UPDATE moderation_notifications SET lease_until=0 WHERE id='review'",
    )
    .run();
  await app.request('/api/manage/review', { cookie: await admin(app) });
  assert.equal(sent.length, 4);
  for (const first of sent.slice(0, 2))
    assert.deepEqual(
      sent.slice(2).find((s) => s.key === first.key),
      first,
    );
  const state = await app.db
    .prepare("SELECT pending FROM moderation_notifications WHERE id='review'")
    .first();
  assert.equal(state.pending, 0);
});
