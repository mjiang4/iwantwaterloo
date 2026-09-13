import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const db =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite';
const ids = Array.from({ length: 70 }, () => randomUUID());
function sql(code) {
  const r = spawnSync('python3', [
    '-c',
    `import sqlite3,json,sys\nd=sqlite3.connect(sys.argv[1])\nids=json.loads(sys.argv[2])\n${code}\nd.commit()`,
    db,
    JSON.stringify(ids),
  ]);
  assert.equal(r.status, 0, r.stderr.toString());
}
async function read(sort, seed = 0, page = 0) {
  const r = await fetch(
    `http://localhost:3000/api/ideas?tag=order-test&sort=${sort}&seed=${seed}&page=${page}`,
  );
  assert.equal(r.status, 200);
  return (await r.json()).ideas;
}
try {
  sql(
    "for n,i in enumerate(ids):\n d.execute('INSERT INTO ideas (id,title,description,category,tags,created_at,visitor_id) VALUES (?,?,?,?,?,?,?)',(i,'Order test','Local test fixture','other','[\"order-test\"]',n,'order-test'))\nd.execute('INSERT INTO supports (idea_id,visitor_id,created_at) VALUES (?,?,?)',(ids[0],'order-test',0))",
  );
  assert.equal((await read('newest'))[0].id, ids.at(-1));
  assert.equal((await read('watered'))[0].id, ids[0]);
  const first = await read('random', 7),
    second = await read('random', 7, 1);
  assert.equal(new Set([...first, ...second].map((i) => i.id)).size, 70);
  assert.deepEqual(await read('random', 7), first);
  assert.notDeepEqual(
    (await read('random', 19)).map((i) => i.id),
    first.map((i) => i.id),
  );
  assert.equal(
    (
      await fetch('http://localhost:3000/api/maintenance-reset', {
        method: 'POST',
      })
    ).status,
    404,
  );
  console.log(
    'PASS: newest, likes, stable random pagination, reshuffle, and reset authorization.',
  );
} finally {
  sql(
    "for i in ids:\n d.execute('DELETE FROM supports WHERE idea_id=?',(i,))\n d.execute('DELETE FROM ideas WHERE id=?',(i,))",
  );
}
