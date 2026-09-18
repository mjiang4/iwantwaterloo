import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';

void test('concurrent replies and lost-response retries create one comment', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  const idea = (
    await browser.request('/api/ideas', { method: 'POST', body: ideaPayload() })
  ).data.idea;
  const payload = {
    ideaId: idea.id,
    parentId: '',
    body: 'Could we try this by the library?',
    displayName: 'Alex, student',
    submissionKey: randomUUID(),
  };
  const pair = await Promise.all(
    [1, 2].map(() =>
      browser.request('/api/comments', { method: 'POST', body: payload }),
    ),
  );
  pair.forEach((r) =>
    assert.ok([200, 201].includes(r.response.status), r.text),
  );
  assert.equal(pair[0].data.comment.id, pair[1].data.comment.id);
  const retry = await browser.request('/api/comments', {
    method: 'POST',
    body: payload,
  });
  assert.equal(retry.response.status, 200);
  assert.equal(
    (await browser.request('/api/comments?ideaId=' + idea.id)).data.comments
      .length,
    1,
  );
  const conflict = await browser.request('/api/comments', {
    method: 'POST',
    body: { ...payload, body: 'Changed after submitting.' },
  });
  assert.equal(conflict.response.status, 409);
  const nested = await browser.request('/api/comments', {
    method: 'POST',
    body: {
      ...payload,
      parentId: pair[0].data.comment.id,
      submissionKey: randomUUID(),
      displayName: '',
    },
  });
  assert.equal(nested.response.status, 201);
  assert.equal(nested.data.comment.parentId, pair[0].data.comment.id);
  const updated = (await browser.request('/api/ideas?id=' + idea.id)).data
    .ideas[0];
  assert.equal(updated.commentCount, 2);
});

void test('reports accept one existing target and reject contradictory targets', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const browser = await app.browser();
  const idea = (
    await browser.request('/api/ideas', { method: 'POST', body: ideaPayload() })
  ).data.idea;
  const reply = (
    await browser.request('/api/comments', {
      method: 'POST',
      body: {
        ideaId: idea.id,
        body: 'A useful addition.',
        submissionKey: randomUUID(),
      },
    })
  ).data.comment;
  for (const target of [{ ideaId: idea.id }, { commentId: reply.id }]) {
    const result = await browser.request('/api/reports', {
      method: 'POST',
      body: { ...target, reason: 'Please review.' },
    });
    assert.equal(result.response.status, 201);
  }
  const ambiguous = await browser.request('/api/reports', {
    method: 'POST',
    body: {
      ideaId: randomUUID(),
      commentId: reply.id,
      reason: 'Please review.',
    },
  });
  assert.equal(ambiguous.response.status, 400);
  const missing = await browser.request('/api/reports', {
    method: 'POST',
    body: { ideaId: randomUUID(), reason: 'Please review.' },
  });
  assert.equal(missing.response.status, 404);
  assert.equal(
    (await app.db.prepare('SELECT count(*) AS count FROM reports').first())
      .count,
    2,
  );
});
