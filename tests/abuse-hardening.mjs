import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHmac } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';

void test('forged and unsigned visitor cookies are rejected; a signed cookie passes', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  // A bare UUID cookie (legacy, unsigned) is treated as absent.
  const legacy = await app.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
    cookie: 'garden_visitor=' + randomUUID(),
  });
  assert.equal(legacy.response.status, 409, legacy.text);
  // A UUID with a forged signature is rejected.
  const forged = await app.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
    cookie: `garden_visitor=${randomUUID()}.${'a'.repeat(64)}`,
  });
  assert.equal(forged.response.status, 409, forged.text);
  // A cookie established through /api/visitor is signed and accepted.
  const browser = await app.browser();
  assert.ok(browser.cookie.includes('.'), 'established cookie is signed');
  const saved = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
  });
  assert.ok([200, 201].includes(saved.response.status), saved.text);
});

void test('hard-blocklist ideas and comments are rejected with 422', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  const rejected = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload({ description: 'you are a faggot and this is a test' }),
  });
  assert.equal(rejected.response.status, 422, rejected.text);
  // No idea was stored.
  assert.equal((await browser.request('/api/ideas')).data.total, 0);
  const idea = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
  });
  const ideaId = idea.data.idea.id;
  const badComment = await browser.request('/api/comments', {
    method: 'POST',
    body: {
      ideaId,
      parentId: '',
      body: 'you absolute faggot',
      displayName: '',
      submissionKey: randomUUID(),
    },
  });
  assert.equal(badComment.response.status, 422, badComment.text);
});

void test('borderline ideas and comments go pending and are hidden from public reads', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  const pending = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload({
      description: 'the fucking potholes downtown need to be fixed now',
    }),
  });
  assert.ok([200, 201].includes(pending.response.status), pending.text);
  const pendingId = pending.data.idea.id;
  // Hidden from the public list, count, and direct id lookup.
  const list = await browser.request('/api/ideas');
  assert.equal(list.data.total, 0);
  assert.equal(
    list.data.ideas.find((i) => i.id === pendingId),
    undefined,
  );
  assert.equal(
    (await browser.request('/api/ideas?id=' + pendingId)).data.ideas.length,
    0,
  );

  // A clean idea with a pending comment: the comment is withheld from the thread.
  const clean = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
  });
  const cleanId = clean.data.idea.id;
  const pendingComment = await browser.request('/api/comments', {
    method: 'POST',
    body: {
      ideaId: cleanId,
      parentId: '',
      body: 'what an asshole move by the developer',
      displayName: '',
      submissionKey: randomUUID(),
    },
  });
  assert.equal(pendingComment.response.status, 201, pendingComment.text);
  const thread = await browser.request('/api/comments?ideaId=' + cleanId);
  assert.equal(thread.data.comments.length, 0);
});

void test('Turnstile is inert when the secret is unset', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  // No outbound verification call is made; writes work with no token.
  const browser = await app.browser();
  assert.equal((await browser.request('/api/visitor')).data.ready, true);
  const idea = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
  });
  assert.equal(idea.response.status, 201, idea.text);
  const like = await browser.request('/api/support', {
    method: 'PUT',
    body: { ideaId: idea.data.idea.id, watered: true },
  });
  assert.equal(like.response.status, 200, like.text);
});

void test('Turnstile gates visitor establishment and likes when provisioned', async (t) => {
  const app = await createApiHarness({ turnstileSecret: 'test-secret' });
  t.after(() => app.dispose());
  // Visitor POST requires a valid token.
  assert.equal(
    (await app.request('/api/visitor', { method: 'POST', body: {} })).response
      .status,
    403,
  );
  assert.equal(
    (
      await app.request('/api/visitor', {
        method: 'POST',
        body: { turnstileToken: 'wrong' },
      })
    ).response.status,
    403,
  );
  const good = await app.request('/api/visitor', {
    method: 'POST',
    body: { turnstileToken: 'valid-token' },
  });
  assert.equal(good.response.status, 200, good.text);
  const cookie = good.response.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.includes('.'), 'established cookie is signed');
  // Ideas do not require a token; likes do.
  const idea = await app.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
    cookie,
  });
  assert.equal(idea.response.status, 201, idea.text);
  const ideaId = idea.data.idea.id;
  const noToken = await app.request('/api/support', {
    method: 'PUT',
    body: { ideaId, watered: true },
    cookie,
  });
  assert.equal(noToken.response.status, 403, noToken.text);
  const withToken = await app.request('/api/support', {
    method: 'PUT',
    body: { ideaId, watered: true, turnstileToken: 'valid-token' },
    cookie,
  });
  assert.equal(withToken.response.status, 200, withToken.text);
  assert.equal(withToken.data.waters, 1);
});

void test('per-IP distinct-support backstop caps new supports but allows idempotent re-likes', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  const first = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
  });
  const firstId = first.data.idea.id;
  const second = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload({ description: 'A second clean idea near the station.' }),
  });
  const secondId = second.data.idea.id;
  const ip = '203.0.113.7';
  const headers = { 'CF-Connecting-IP': ip };
  // One genuine support creates the per-IP distinct counter.
  const liked = await browser.request('/api/support', {
    method: 'PUT',
    body: { ideaId: firstId, watered: true },
    headers,
  });
  assert.equal(liked.response.status, 200, liked.text);
  // Drive that counter to its cap.
  const key = createHmac('sha256', app.secret)
    .update(`support-distinct:${Math.floor(Date.now() / 600000)}:${ip}`)
    .digest('hex');
  await app.db
    .prepare('UPDATE rate_limits SET count=60 WHERE key=?')
    .bind(key)
    .run();
  // Re-liking the SAME idea is idempotent and bypasses the distinct cap.
  const reLike = await browser.request('/api/support', {
    method: 'PUT',
    body: { ideaId: firstId, watered: true },
    headers,
  });
  assert.equal(reLike.response.status, 200, reLike.text);
  // A NEW distinct idea from the same IP is blocked.
  const blocked = await browser.request('/api/support', {
    method: 'PUT',
    body: { ideaId: secondId, watered: true },
    headers,
  });
  assert.equal(blocked.response.status, 429, blocked.text);
});
