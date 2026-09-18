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
