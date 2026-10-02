import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';

async function heldText(request) {
  const { input } = await request.json();
  const flagged = /fucking|asshole/.test(input);
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
  return Response.json({
    results: [
      {
        categories: Object.fromEntries(
          keys.map((k) => [k, k === 'harassment' && flagged]),
        ),
        category_scores: Object.fromEntries(
          keys.map((k) => [k, k === 'harassment' && flagged ? 0.99 : 0]),
        ),
      },
    ],
  });
}

const OWNER = 'jerry@unrepped.co';
const PASSWORD = 'Test8!ab';
function encodedPassword() {
  const salt = randomBytes(16).toString('hex');
  return (
    'scrypt-v1:' +
    salt +
    ':' +
    scryptSync(PASSWORD, salt, 32, {
      N: 16384,
      r: 8,
      p: 5,
      maxmem: 33554432,
    }).toString('hex')
  );
}
async function moderatorCookie(app) {
  await app.db
    .prepare(
      'INSERT OR IGNORE INTO admin_passwords(email,password_hash,updated_at) VALUES (?,?,?)',
    )
    .bind(OWNER, encodedPassword(), Date.now())
    .run();
  const login = await app.request('/api/manage/login', {
    method: 'POST',
    body: { email: OWNER, password: PASSWORD },
  });
  assert.equal(login.response.status, 200, login.text);
  return login.response.headers.get('set-cookie').split(';')[0];
}

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

void test('borderline ideas and comments go pending and are hidden from public reads', async (t) => {
  const app = await createApiHarness({ moderation: heldText });
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
  // Visitor POST requires a valid token, and a rejection must NOT mint a usable cookie.
  const missing = await app.request('/api/visitor', {
    method: 'POST',
    body: {},
  });
  assert.equal(missing.response.status, 403);
  assert.equal(
    missing.response.headers.get('set-cookie'),
    null,
    'a Turnstile failure must not set a visitor cookie',
  );
  const wrong = await app.request('/api/visitor', {
    method: 'POST',
    body: { turnstileToken: 'wrong' },
  });
  assert.equal(wrong.response.status, 403);
  assert.equal(wrong.response.headers.get('set-cookie'), null);
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
    .update(`rl:support-distinct:${Math.floor(Date.now() / 600000)}:${ip}`)
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

void test('a moderator can approve a pending idea and it becomes publicly visible', async (t) => {
  const app = await createApiHarness({ moderation: heldText });
  t.after(() => app.dispose());
  const browser = await app.browser();
  const pending = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload({
      description: 'the fucking potholes downtown need fixing now',
    }),
  });
  assert.ok([200, 201].includes(pending.response.status), pending.text);
  assert.equal(
    pending.data.idea.moderationState,
    'pending',
    'author gets a pending signal',
  );
  const id = pending.data.idea.id;
  assert.equal((await browser.request('/api/ideas')).data.total, 0);
  const cookie = await moderatorCookie(app);
  // Moderator finds it via the state filter and sees its moderation state.
  const list = await app.request('/api/manage/ideas?state=pending', { cookie });
  assert.equal(list.response.status, 200, list.text);
  assert.equal(list.data.ideas[0].id, id);
  assert.equal(list.data.ideas[0].moderationState, 'pending');
  // Approve it.
  const patched = await app.request('/api/manage/ideas', {
    method: 'PATCH',
    cookie,
    body: { id, state: 'visible' },
  });
  assert.equal(patched.response.status, 200, patched.text);
  // Now public.
  const nowPublic = await browser.request('/api/ideas');
  assert.equal(nowPublic.data.total, 1);
  assert.equal(nowPublic.data.ideas[0].id, id);
});

void test('a pending idea cannot be liked, replied to, or reported by id', async (t) => {
  const app = await createApiHarness({ moderation: heldText });
  t.after(() => app.dispose());
  const browser = await app.browser();
  const pending = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload({
      description: 'the fucking potholes downtown need fixing now',
    }),
  });
  const id = pending.data.idea.id;
  const like = await browser.request('/api/support', {
    method: 'PUT',
    body: { ideaId: id, watered: true },
  });
  assert.equal(like.response.status, 404, like.text);
  const reply = await browser.request('/api/comments', {
    method: 'POST',
    body: {
      ideaId: id,
      parentId: '',
      body: 'a clean reply about this',
      displayName: '',
      submissionKey: randomUUID(),
    },
  });
  assert.equal(reply.response.status, 404, reply.text);
  const report = await browser.request('/api/reports', {
    method: 'POST',
    body: { ideaId: id, reason: 'test reason' },
  });
  assert.equal(report.response.status, 404, report.text);
});

void test('visitor establishment is rate-limited per IP', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const ip = '198.51.100.42';
  const now = Date.now();
  const key = createHmac('sha256', app.secret)
    .update(`rl:visitor:${Math.floor(now / 600000)}:${ip}`)
    .digest('hex');
  await app.db
    .prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,?,?)')
    .bind(key, 30, now + 600000)
    .run();
  const blocked = await app.request('/api/visitor', {
    method: 'POST',
    body: {},
    headers: { 'CF-Connecting-IP': ip },
  });
  assert.equal(blocked.response.status, 429, blocked.text);
  assert.equal(blocked.response.headers.get('set-cookie'), null);
});

void test('a partial Turnstile configuration stays inert for client and server', async (t) => {
  for (const config of [
    { turnstileSecret: 'test-secret', turnstileSitekey: null },
    { turnstileSecret: null, turnstileSitekey: 'test-sitekey' },
  ]) {
    const app = await createApiHarness(config);
    t.after(() => app.dispose());
    assert.equal((await app.request('/api/visitor')).data.turnstileSitekey, '');
    const browser = await app.browser();
    const idea = await browser.request('/api/ideas', {
      method: 'POST',
      body: ideaPayload(),
    });
    const like = await browser.request('/api/support', {
      method: 'PUT',
      body: { ideaId: idea.data.idea.id, watered: true },
    });
    assert.equal(like.response.status, 200, like.text);
  }
});
