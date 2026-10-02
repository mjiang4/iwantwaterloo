import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiHarness } from './helpers/api-harness.mjs';

void test('preview controls fail closed outside an authenticated isolated preview', async (t) => {
  const ordinary = await createApiHarness();
  t.after(() => ordinary.dispose());
  assert.equal((await ordinary.request('/api/admin')).response.status, 404);
  const preview = await createApiHarness({ preview: true });
  t.after(() => preview.dispose());
  assert.equal((await preview.request('/api/admin')).response.status, 401);
  await preview.db
    .prepare("UPDATE preview_identity SET value='wrong-environment'")
    .run();
  assert.equal((await preview.request('/api/admin')).response.status, 503);
  const mutation = await preview.request('/api/admin/scenario', {
    method: 'POST',
    body: { scenario: 'empty' },
  });
  assert.equal(mutation.response.status, 503);
});

void test('preview scenarios use defaults and undo preserves legacy metadata and tree positions', async (t) => {
  const app = await createApiHarness({ preview: true });
  t.after(() => app.dispose());
  const login = await app.request('/api/admin/session', {
    method: 'POST',
    body: { key: app.secret },
  });
  assert.equal(login.response.status, 200, login.text);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const scenario = async (body) =>
    app.request('/api/admin/scenario', {
      method: 'POST',
      cookie,
      body: { key: crypto.randomUUID(), ...body },
    });
  const sample = await scenario({ action: 'scenario', scenario: 'sample' });
  assert.equal(sample.response.status, 200, sample.text);
  const first = await app.db
    .prepare('SELECT rowid,id FROM ideas ORDER BY rowid LIMIT 1')
    .first();
  await app.db
    .prepare('UPDATE ideas SET tags=?,connection=? WHERE id=?')
    .bind('["historic"]', 'From Waterloo', first.id)
    .run();
  const empty = await scenario({ action: 'scenario', scenario: 'empty' });
  assert.equal(empty.response.status, 200, empty.text);
  assert.equal((await app.request('/api/ideas')).data.total, 0);
  const undo = await scenario({ action: 'undo' });
  assert.equal(undo.response.status, 200, undo.text);
  const restored = await app.db
    .prepare('SELECT rowid,tags,connection FROM ideas WHERE id=?')
    .bind(first.id)
    .first();
  assert.deepEqual(restored, {
    rowid: first.rowid,
    tags: '["historic"]',
    connection: 'From Waterloo',
  });
});
