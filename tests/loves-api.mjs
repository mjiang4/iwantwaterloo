import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApiHarness } from './helpers/api-harness.mjs';

const post = (body) => ({ method: 'POST', body });
const put = (body) => ({ method: 'PUT', body });
function lovePayload(overrides = {}) {
  return {
    body: 'The ducks at Silver Lake in the morning.',
    x: 12.9,
    z: 7,
    landmark: 'silver-lake',
    displayName: '  River  ',
    submissionKey: randomUUID(),
    ...overrides,
  };
}
const PUBLIC_KEYS = [
  'id',
  'body',
  'x',
  'z',
  'landmark',
  'displayName',
  'createdAt',
  'echoes',
  'echoed',
  'owned',
];
async function count(app) {
  return (await app.db.prepare('SELECT count(*) AS n FROM loves').first()).n;
}

void test('loves are created, listed newest first, and never expose private fields', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const author = await app.browser(),
    other = await app.browser();
  const created = await author.request('/api/loves', post(lovePayload()));
  assert.equal(created.response.status, 201, created.text);
  const love = created.data.love;
  assert.equal(love.body, 'The ducks at Silver Lake in the morning.');
  assert.equal(love.displayName, 'River');
  assert.equal(love.landmark, 'silver-lake');
  assert.deepEqual(
    { echoes: love.echoes, echoed: love.echoed, owned: love.owned },
    { echoes: 0, echoed: false, owned: true },
  );
  const anonymous = await author.request(
    '/api/loves',
    post(lovePayload({ landmark: undefined, displayName: '', x: -26, z: 17 })),
  );
  assert.equal(anonymous.response.status, 201, anonymous.text);
  await app.db
    .prepare('UPDATE loves SET created_at=created_at-1000 WHERE id=?')
    .bind(love.id)
    .run();
  const listed = await other.request('/api/loves');
  assert.equal(listed.response.status, 200);
  assert.deepEqual(
    listed.data.loves.map((l) => l.id),
    [anonymous.data.love.id, love.id],
  );
  for (const item of listed.data.loves) {
    for (const key of Object.keys(item))
      assert.ok(PUBLIC_KEYS.includes(key), 'unexpected public field ' + key);
    assert.equal(item.owned, false);
    assert.equal(typeof item.echoed, 'boolean');
  }
  assert.equal(Object.hasOwn(listed.data.loves[0], 'landmark'), false);
  assert.equal(Object.hasOwn(listed.data.loves[0], 'displayName'), false);
  assert.doesNotMatch(listed.text, /visitor|submission/i);
  assert.equal(
    (await author.request('/api/loves')).data.loves[1].owned,
    true,
    'ownership is relative to the requesting browser',
  );
});

void test('love validation rejects bad text, positions, landmarks, keys, and origins', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  for (const overrides of [
    { body: 'hi' },
    { body: '   ab   ' },
    { body: 'x'.repeat(201) },
    { body: 'bell\u0007' },
    { body: 42 },
    { displayName: 'n'.repeat(61) },
    { x: 21.5 },
    { x: -26.1 },
    { z: -15.1 },
    { z: 17.1 },
    { x: '3' },
    { z: null },
    { landmark: 'city-hall' },
    { submissionKey: undefined },
    { submissionKey: 'not-a-key' },
  ]) {
    const result = await browser.request(
      '/api/loves',
      post(lovePayload(overrides)),
    );
    assert.equal(result.response.status, 400, JSON.stringify(overrides));
  }
  assert.equal(
    (
      await browser.request('/api/loves', {
        ...post(lovePayload()),
        requestOrigin: 'https://elsewhere.test',
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await app.request('/api/loves', post(lovePayload()))).response.status,
    409,
    'writes require an established visitor',
  );
  assert.equal(
    (
      await browser.request(
        '/api/loves',
        post(lovePayload({ body: 'x'.repeat(200) })),
      )
    ).response.status,
    201,
  );
  assert.equal(await count(app), 1);
});

void test('love submissions are retry-safe, conflict-safe, and capped per visitor', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser(),
    stranger = await app.browser();
  const payload = lovePayload();
  const first = await browser.request('/api/loves', post(payload));
  assert.equal(first.response.status, 201, first.text);
  const retry = await browser.request('/api/loves', post(payload));
  assert.equal(retry.response.status, 200, retry.text);
  assert.equal(retry.data.love.id, first.data.love.id);
  assert.equal(await count(app), 1);
  assert.equal(
    (
      await browser.request(
        '/api/loves',
        post({ ...payload, body: 'Something else entirely.' }),
      )
    ).response.status,
    409,
  );
  assert.equal(
    (await stranger.request('/api/loves', post(payload))).response.status,
    409,
    'another browser cannot claim the key',
  );
  const racing = lovePayload({ body: 'The splash pad in July.' });
  const race = await Promise.all([
    browser.request('/api/loves', post(racing)),
    browser.request('/api/loves', post(racing)),
  ]);
  for (const r of race)
    assert.ok([200, 201].includes(r.response.status), r.text);
  assert.equal(race[0].data.love.id, race[1].data.love.id);
  assert.equal(await count(app), 2);
  for (let i = 0; i < 3; i++)
    assert.equal(
      (await browser.request('/api/loves', post(lovePayload()))).response
        .status,
      201,
    );
  const capped = await browser.request('/api/loves', post(lovePayload()));
  assert.equal(capped.response.status, 429, capped.text);
  assert.equal(capped.response.headers.get('retry-after'), '600');
  assert.equal(await count(app), 5);
  assert.equal(
    (await browser.request('/api/loves', post(payload))).response.status,
    200,
    'a saved retry still succeeds at the cap',
  );
});

void test('echoes are desired-state, visible-only, and hidden loves disappear', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const author = await app.browser(),
    fan = await app.browser();
  const love = (await author.request('/api/loves', post(lovePayload()))).data
    .love;
  for (let i = 0; i < 2; i++) {
    const echo = await fan.request(
      '/api/loves/echo',
      put({ loveId: love.id, echoed: true }),
    );
    assert.equal(echo.response.status, 200, echo.text);
    assert.deepEqual(echo.data, { id: love.id, echoes: 1, echoed: true });
  }
  const seen = (await fan.request('/api/loves')).data.loves[0];
  assert.equal(seen.echoes, 1);
  assert.equal(seen.echoed, true);
  assert.equal(
    (await author.request('/api/loves')).data.loves[0].echoed,
    false,
  );
  assert.deepEqual(
    (
      await fan.request(
        '/api/loves/echo',
        put({ loveId: love.id, echoed: false }),
      )
    ).data,
    { id: love.id, echoes: 0, echoed: false },
  );
  assert.equal(
    (
      await fan.request(
        '/api/loves/echo',
        put({ loveId: randomUUID(), echoed: true }),
      )
    ).response.status,
    404,
  );
  assert.equal(
    (
      await fan.request(
        '/api/loves/echo',
        put({ loveId: love.id, echoed: 'yes' }),
      )
    ).response.status,
    400,
  );
  await app.db
    .prepare("UPDATE loves SET moderation_state='hidden' WHERE id=?")
    .bind(love.id)
    .run();
  assert.deepEqual((await fan.request('/api/loves')).data.loves, []);
  assert.equal(
    (
      await fan.request(
        '/api/loves/echo',
        put({ loveId: love.id, echoed: true }),
      )
    ).response.status,
    404,
  );
});

void test('reports accept exactly one target, including a visible love', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  const love = (await browser.request('/api/loves', post(lovePayload()))).data
    .love;
  const reported = await browser.request(
    '/api/reports',
    post({ loveId: love.id, reason: 'Not about the park.' }),
  );
  assert.equal(reported.response.status, 201, reported.text);
  assert.equal(
    (await app.db.prepare('SELECT love_id FROM reports').first()).love_id,
    love.id,
  );
  assert.equal(
    (
      await browser.request(
        '/api/reports',
        post({ loveId: love.id, ideaId: randomUUID(), reason: 'Two targets.' }),
      )
    ).response.status,
    400,
  );
  assert.equal(
    (
      await browser.request(
        '/api/reports',
        post({ loveId: randomUUID(), reason: 'Missing.' }),
      )
    ).response.status,
    404,
  );
  await app.db
    .prepare("UPDATE loves SET moderation_state='hidden' WHERE id=?")
    .bind(love.id)
    .run();
  assert.equal(
    (
      await browser.request(
        '/api/reports',
        post({ loveId: love.id, reason: 'Already hidden.' }),
      )
    ).response.status,
    404,
  );
});

void test('preview scenario clears loves and undo restores them with echoes', async (t) => {
  const app = await createApiHarness({ preview: true });
  t.after(() => app.dispose());
  const author = await app.browser(),
    fan = await app.browser();
  const love = (await author.request('/api/loves', post(lovePayload()))).data
    .love;
  await fan.request('/api/loves/echo', put({ loveId: love.id, echoed: true }));
  const login = await app.request(
    '/api/admin/session',
    post({ key: app.secret }),
  );
  assert.equal(login.response.status, 200, login.text);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const scenario = await app.request('/api/admin/scenario', {
    ...post({ key: randomUUID(), action: 'scenario', scenario: 'sample' }),
    cookie,
  });
  assert.equal(scenario.response.status, 200, scenario.text);
  assert.deepEqual((await app.request('/api/loves')).data.loves, []);
  const undo = await app.request('/api/admin/scenario', {
    ...post({ key: randomUUID(), action: 'undo' }),
    cookie,
  });
  assert.equal(undo.response.status, 200, undo.text);
  const restored = (await fan.request('/api/loves')).data.loves;
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, love.id);
  assert.equal(restored[0].echoes, 1);
  assert.equal(restored[0].echoed, true);
  assert.equal(restored[0].x, love.x);
});
