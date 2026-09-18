import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHmac } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';

void test('anonymous identity is established before writes, and retries retain ownership', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const payload = ideaPayload();
  const blocked = await app.request('/api/ideas', {
    method: 'POST',
    body: payload,
  });
  assert.equal(blocked.response.status, 409);
  assert.equal((await app.request('/api/ideas')).data.total, 0);
  // Losing a bootstrap response cannot lose a contribution: none has been sent.
  await app.request('/api/visitor', { method: 'POST', body: {} });
  const browser = await app.browser();
  assert.equal((await browser.request('/api/visitor')).data.ready, true);
  const pair = await Promise.all(
    [1, 2].map(() =>
      browser.request('/api/ideas', { method: 'POST', body: payload }),
    ),
  );
  pair.forEach((result) =>
    assert.ok([200, 201].includes(result.response.status), result.text),
  );
  assert.equal(pair[0].data.idea.id, pair[1].data.idea.id);
  const mine = await browser.request('/api/ideas?mine=1');
  assert.equal(mine.data.total, 1);
  assert.equal(mine.data.ideas[0].id, pair[0].data.idea.id);
  assert.equal(pair[0].data.idea.visitor_id, undefined);
  assert.equal(pair[0].data.idea.submissionKey, undefined);
  const conflict = await browser.request('/api/ideas', {
    method: 'POST',
    body: { ...payload, description: 'Different content with the same key.' },
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(
    (await app.request('/api/ideas')).response.headers.get('set-cookie'),
    null,
  );
});

void test('validation, origin checks, like idempotency and rate limits use real D1', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  const payload = ideaPayload({ tags: ['#Bike Lanes', 'bike_lanes'] });
  const saved = await browser.request('/api/ideas', {
    method: 'POST',
    body: payload,
  });
  assert.equal(saved.response.status, 201, saved.text);
  assert.deepEqual(saved.data.idea.tags, ['bike-lanes']);
  assert.equal(saved.data.idea.displayName, undefined);
  const id = saved.data.idea.id;
  const malformed = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload({ tags: ['a', 'b', 'c', 'd'] }),
  });
  assert.equal(malformed.response.status, 400);
  const crossOrigin = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
    requestOrigin: 'https://unrelated.example',
  });
  assert.equal(crossOrigin.response.status, 403);
  assert.equal(
    (await browser.request('/api/ideas?q=' + encodeURIComponent("' OR 1=1 --")))
      .data.total,
    0,
  );
  assert.equal(
    (await browser.request('/api/ideas?tag=bike-lanes')).data.total,
    1,
  );
  const grove = await browser.request(
    '/api/ideas?garden=1&page=' + Math.floor(saved.data.idea.plot / 24),
  );
  assert.equal(grove.data.ideas[0].plot, saved.data.idea.plot);
  for (const expected of [1, 1, 0]) {
    const result = await browser.request('/api/support', {
      method: 'PUT',
      body: { ideaId: id, watered: expected === 1 },
    });
    assert.equal(result.data.waters, expected);
  }
  const ip = '198.51.100.99';
  const key = createHmac('sha256', app.secret)
    .update(`ideas:${Math.floor(Date.now() / 86400000)}:${ip}`)
    .digest('hex');
  await app.db
    .prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,?,?)')
    .bind(key, 120, Date.now() + 600000)
    .run();
  const limited = await browser.request('/api/ideas', {
    method: 'POST',
    body: ideaPayload(),
    headers: { 'CF-Connecting-IP': ip },
  });
  assert.equal(limited.response.status, 429, limited.text);
  assert.ok(limited.response.headers.get('retry-after'));
  const retry = await browser.request('/api/ideas', {
    method: 'POST',
    body: payload,
    headers: { 'CF-Connecting-IP': ip },
  });
  assert.equal(retry.response.status, 200);
  for (const url of ['/api/export', '/api/stats', '/api/admin'])
    assert.equal((await browser.request(url)).response.status, 404);
  assert.equal(
    (
      await browser.request('/api/support', {
        method: 'PUT',
        body: { ideaId: randomUUID(), watered: true },
      })
    ).response.status,
    404,
  );
});
