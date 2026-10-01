import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApiHarness } from './helpers/api-harness.mjs';

void test('website feedback is separate, protected and idempotent across retries', async () => {
  const site = await createApiHarness();
  try {
    const browser = await site.browser();
    const payload = {
      body: 'Please make the garden controls easier to find.',
      submissionKey: randomUUID(),
    };
    assert.equal(
      (await site.request('/api/feedback', { method: 'POST', body: payload }))
        .response.status,
      409,
    );
    assert.equal(
      (
        await browser.request('/api/feedback', {
          method: 'POST',
          body: payload,
          requestOrigin: 'https://other.test',
        })
      ).response.status,
      403,
    );
    assert.equal(
      (
        await browser.request('/api/feedback', {
          method: 'POST',
          body: { ...payload, website: 'spam' },
        })
      ).response.status,
      400,
    );
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        browser.request('/api/feedback', { method: 'POST', body: payload }),
      ),
    );
    assert.ok(results.every(({ response }) => response.ok));
    assert.equal(new Set(results.map(({ data }) => data.id)).size, 1);
    assert.equal(
      (
        await site.db
          .prepare('SELECT count(*) AS n FROM website_feedback')
          .first()
      ).n,
      1,
    );
    assert.equal(
      (await site.db.prepare('SELECT count(*) AS n FROM ideas').first()).n,
      0,
    );
    assert.equal(
      (
        await browser.request('/api/feedback', {
          method: 'POST',
          body: {
            ...payload,
            body: 'A different message must not reuse the same submission.',
          },
        })
      ).response.status,
      409,
    );
    assert.equal((await browser.request('/api/feedback')).response.status, 404);
    let limited = false;
    for (let i = 0; i < 6; i++) {
      const result = await browser.request('/api/feedback', {
        method: 'POST',
        body: { ...payload, submissionKey: randomUUID() },
      });
      if (result.response.status === 429) {
        limited = true;
        break;
      }
    }
    assert.ok(limited);
    assert.ok(
      (
        await browser.request('/api/feedback', {
          method: 'POST',
          body: payload,
        })
      ).response.ok,
    );
  } finally {
    await site.dispose();
  }
});
