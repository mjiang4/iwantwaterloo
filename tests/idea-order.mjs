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
          'INSERT INTO ideas(id,title,description,category,created_at,visitor_id) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          id,
          'Idea ' + index,
          'Specific suggestion ' + index,
          'other',
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
      await app.request(`/api/ideas?sort=${sort}&page=${page}&seed=${seed}`)
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

void test('thirty ideas fit in a single grove without hiding older trees', async (t) => {
  const app = await createApiHarness();
  t.after(() => app.dispose());
  await app.db.batch(
    Array.from({ length: 30 }, (_, i) =>
      app.db
        .prepare(
          'INSERT INTO ideas(id,title,description,category,created_at,visitor_id) VALUES (?,?,?,?,?,?)',
        )
        .bind(randomUUID(), 'Tree ' + i, 'Tree ' + i, 'other', i, 'fixture'),
    ),
  );
  const page = (await app.request('/api/ideas?garden=1')).data;
  assert.equal(page.total, 30);
  assert.equal(page.ideas.length, 30);
  assert.deepEqual(page.grovePages, [0]);
  assert.equal(new Set(page.ideas.map((i) => i.plot)).size, 30);
});
