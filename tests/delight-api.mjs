import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const visitor = randomUUID();
const created = { ideas: [], comments: [] };
const db =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite';
async function request(path, { method = 'GET', body } = {}) {
  const init = {
    method,
    headers: {
      Cookie: `garden_visitor=${visitor}`,
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
    },
  };
  if (body) init.body = JSON.stringify(body);
  const response = await fetch(base + path, {
    ...init,
  });
  return { response, data: await response.json() };
}

try {
  const ideaPayload = {
    title: 'A delightful test idea',
    description: 'A fixture for names, links, and thoughtful replies.',
    displayName: 'River',
    tags: ['testing'],
    place: '',
    connection: '',
    consent: true,
    submissionKey: randomUUID(),
  };
  const saved = await request('/api/ideas', {
    method: 'POST',
    body: ideaPayload,
  });
  assert.equal(saved.response.status, 201);
  assert.equal(saved.data.idea.displayName, 'River');
  created.ideas.push(saved.data.idea.id);
  const direct = await request(`/api/ideas?id=${saved.data.idea.id}`);
  assert.equal(direct.data.ideas.length, 1);

  const root = await request('/api/comments', {
    method: 'POST',
    body: {
      ideaId: saved.data.idea.id,
      parentId: '',
      body: 'Could this start near the library?',
      displayName: 'Alex',
      submissionKey: randomUUID(),
    },
  });
  assert.equal(root.response.status, 201);
  created.comments.push(root.data.comment.id);
  const replyKey = randomUUID();
  const replyPayload = {
    ideaId: saved.data.idea.id,
    parentId: root.data.comment.id,
    body: 'That would be a great pilot location.',
    displayName: '',
    submissionKey: replyKey,
  };
  const reply = await request('/api/comments', {
    method: 'POST',
    body: replyPayload,
  });
  assert.equal(reply.response.status, 201);
  created.comments.push(reply.data.comment.id);
  const retried = await request('/api/comments', {
    method: 'POST',
    body: replyPayload,
  });
  assert.equal(retried.data.comment.id, reply.data.comment.id);
  const thread = await request(`/api/comments?ideaId=${saved.data.idea.id}`);
  assert.equal(thread.data.comments.length, 2);
  assert.equal(thread.data.comments[1].parentId, root.data.comment.id);
  const report = await request('/api/reports', {
    method: 'POST',
    body: {
      commentId: root.data.comment.id,
      reason: 'Integration test report',
    },
  });
  assert.equal(report.response.status, 201);
  console.log(
    'PASS: optional names, direct idea lookup, nested replies, retry safety, and reporting.',
  );
} finally {
  const cleanup = spawnSync('python3', [
    '-c',
    "import sqlite3,json,sys; d=sqlite3.connect(sys.argv[1]); ids=json.loads(sys.argv[2]); [d.execute('DELETE FROM reports WHERE idea_id=? OR comment_id IN (SELECT id FROM comments WHERE idea_id=?)',(i,i)) for i in ids]; [d.execute('DELETE FROM comments WHERE idea_id=?',(i,)) for i in ids]; [d.execute('DELETE FROM supports WHERE idea_id=?',(i,)) for i in ids]; [d.execute('DELETE FROM ideas WHERE id=?',(i,)) for i in ids]; d.commit()",
    db,
    JSON.stringify(created.ideas),
  ]);
  assert.equal(cleanup.status, 0, cleanup.stderr.toString());
}
