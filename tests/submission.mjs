import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submissionFor } from '../lib/submission.ts';
import { rejectExternalTarget } from './helpers/api-harness.mjs';
void test('unchanged drafts retain their key; edited drafts receive a different key', () => {
  const first = submissionFor({ body: 'Try this by the library.' }, null);
  assert.equal(
    submissionFor({ body: 'Try this by the library.' }, first).key,
    first.key,
  );
  assert.notEqual(
    submissionFor({ body: 'Try this by the station.' }, first).key,
    first.key,
  );
});
void test('API harness refuses an externally supplied test destination', () => {
  const previous = process.env.TEST_BASE_URL;
  process.env.TEST_BASE_URL = 'https://iwantwaterloo.com';
  try {
    assert.throws(rejectExternalTarget, /external targets are never used/);
  } finally {
    if (previous === undefined) delete process.env.TEST_BASE_URL;
    else process.env.TEST_BASE_URL = previous;
  }
});
