import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApiHarness } from './helpers/api-harness.mjs';

void test('new, most liked and seeded random paginate without duplicates', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const ids = Array.from({ length: 70 }, () => randomUUID());
  await app.db.batch(
    ids.map((id, index) =>
      app.db
        .prepare(
          'INSERT INTO ideas(id,title,description,category,tags,created_at,visitor_id) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          'Idea ' + index,
          'Specific suggestion ' + index,
          'other',
          '["order-test"]',
          1000 + index,
          'test-fixture',
        ),
    ),
  );
  await app.db
    .prepare(
      'INSERT INTO supports(idea_id,visitor_id,created_at) VALUES (?,?,?)',
    )
    .bind(ids[0], 'test-like', 1000)
    .run();
  const read = async (sort, page = 0, seed = 7) =>
    (
      await app.request(
        `/api/ideas?tag=order-test&sort=${sort}&page=${page}&seed=${seed}`,
      )
    ).data.ideas.map((i) => i.id);
  assert.equal((await read('newest'))[0], ids[69]);
  assert.equal((await read('watered'))[0], ids[0]);
  for (const sort of ['newest', 'watered', 'random']) {
    const all = [...(await read(sort)), ...(await read(sort, 1))];
    assert.equal(all.length, 70);
    assert.equal(new Set(all).size, 70);
  }
  assert.deepEqual(await read('random'), await read('random'));
  assert.notDeepEqual(await read('random', 0, 7), await read('random', 0, 8));
});
