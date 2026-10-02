import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';

void test('retired metadata is ignored for old clients, omitted publicly and preserved in storage', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  const payload = ideaPayload({
    category: 'homes',
    tags: ['old-client'],
    connection: 'From Waterloo',
  });
  const saved = await browser.request('/api/ideas', {
    method: 'POST',
    body: payload,
  });
  assert.equal(saved.response.status, 201, saved.text);
  for (const key of ['category', 'tags', 'connection'])
    assert.equal(key in saved.data.idea, false);
  const id = saved.data.idea.id;
  await app.db
    .prepare('UPDATE ideas SET category=?,tags=?,connection=? WHERE id=?')
    .bind('homes', '["legacy-only"]', 'From Waterloo', id)
    .run();
  const retry = await browser.request('/api/ideas', {
    method: 'POST',
    body: { ...payload, tags: [] },
  });
  assert.equal(retry.response.status, 200, retry.text);
  assert.equal(retry.data.idea.id, id);
  const result = await browser.request(`/api/ideas?id=${id}`);
  assert.equal(result.data.ideas[0].plot, saved.data.idea.plot);
  for (const key of ['category', 'tags', 'connection'])
    assert.equal(key in result.data.ideas[0], false);
  assert.equal(
    (await browser.request('/api/ideas?q=legacy-only')).data.total,
    0,
  );
  const stored = await app.db
    .prepare('SELECT tags,connection,category FROM ideas WHERE id=?')
    .bind(id)
    .first();
  assert.deepEqual(stored, {
    tags: '["legacy-only"]',
    connection: 'From Waterloo',
    category: 'homes',
  });
  assert.equal((await browser.request('/api/tags')).response.status, 404);
});
