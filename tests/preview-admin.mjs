import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { runPreviewChecks } from '../lib/preview-checks.ts';
const base = 'http://localhost:3001';
const config = parseEnv(await readFile('.env.preview', 'utf8'));
const jar = new Map();
async function http(input, init = {}) {
  const url = new URL(input, base);
  assert.equal(url.origin, base, 'Preview tests are local only');
  const headers = new Headers(init.headers);
  if (init.credentials !== 'omit' && jar.size && !headers.has('Cookie'))
    headers.set(
      'Cookie',
      [...jar]
        .filter(
          ([k]) =>
            k !== 'garden_preview_admin' ||
            url.pathname.startsWith('/api/admin'),
        )
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    );
  if (init.body) headers.set('Origin', base);
  const response = await fetch(url, { ...init, headers });
  if (init.credentials !== 'omit')
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'),
        i = pair.indexOf('=');
      if (/Max-Age=0(?:;|$)/.test(cookie)) jar.delete(pair.slice(0, i));
      else jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  return response;
}
async function api(url, method = 'GET', body) {
  const r = await http(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json(), headers: r.headers };
}
async function change(body, key = randomUUID()) {
  return api('/api/admin/scenario', 'POST', { ...body, key });
}
async function sqlFile(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await sqlFile(file);
      if (found) return found;
    } else if (entry.name.endsWith('.sqlite')) {
      const candidate = new DatabaseSync(file, { readOnly: true });
      try {
        const hasIdentity = candidate
          .prepare("SELECT 1 FROM sqlite_master WHERE name='preview_identity'")
          .get();
        if (
          hasIdentity &&
          candidate
            .prepare('SELECT value FROM preview_identity WHERE id=1')
            .get()?.value === config.PREVIEW_ID
        )
          return file;
      } finally {
        candidate.close();
      }
    }
  }
}
const ordinaryBefore = await (
  await fetch('http://localhost:3000/api/ideas')
).json();
assert.equal((await api('/api/admin')).status, 401);
assert.equal(
  (await change({ action: 'scenario', scenario: 'sample' })).status,
  401,
);
assert.equal(
  (
    await http('/api/admin', {
      headers: { 'oai-authenticated-user-email': 'jerry.m.jiang@gmail.com' },
    })
  ).status,
  401,
  'Local preview must not trust identity headers',
);
assert.equal(
  (await fetch('http://localhost:3000/api/admin')).status,
  404,
  'Ordinary dev site must not enable preview controls',
);
assert.equal(
  (await api('/api/admin/session', 'POST', { key: 'a'.repeat(64) })).status,
  401,
);
const link = await api('/api/admin/session', 'POST', {
  key: config.PREVIEW_ADMIN_SECRET,
  issueLink: true,
});
assert.equal(link.status, 200);
const session = await api('/api/admin/session', 'POST', {
  ticket: link.data.ticket,
});
assert.equal(session.status, 200);
assert.match(session.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
assert.match(session.headers.get('set-cookie'), /Path=\/api\/admin/);
assert.equal(
  (await api('/api/admin/session', 'POST', { ticket: link.data.ticket }))
    .status,
  401,
  'Tickets are single use',
);
assert.equal(
  (await api('/api/admin')).data.counts.ideas,
  0,
  'Start this suite with an empty preview garden',
);
console.log(
  'PASS: disabled defaults, operator authentication, forged-header rejection, one-time links and cookie scope.',
);
try {
  const key = randomUUID(),
    sample = await change({ action: 'scenario', scenario: 'sample' }, key);
  assert.equal(sample.status, 200, JSON.stringify(sample.data));
  assert.equal(sample.data.counts.ideas, 8);
  const ids = sample.data.ideas.map((i) => i.id).sort();
  assert.deepEqual(
    (await change({ action: 'scenario', scenario: 'sample' }, key)).data.ideas
      .map((i) => i.id)
      .sort(),
    ids,
    'Retries cannot replace fixtures twice',
  );
  assert.equal(
    (await change({ action: 'scenario', scenario: 'full' }, key)).status,
    409,
  );
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrf = await fetch(base + '/api/admin/scenario', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://unrelated.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'scenario',
      scenario: 'empty',
      key: randomUUID(),
    }),
  });
  assert.equal(csrf.status, 403);
  assert.equal(
    (await change({ action: 'scenario', scenario: '__proto__' })).status,
    400,
  );
  const idea = sample.data.ideas[0],
    original = await api('/api/ideas?id=' + idea.id);
  assert.equal(
    (await change({ action: 'likes', ideaId: idea.id, likes: 100 })).status,
    200,
  );
  assert.equal(
    (await api('/api/ideas?id=' + idea.id)).data.ideas[0].waters,
    100,
  );
  assert.equal((await change({ action: 'undo' })).status, 200);
  assert.equal(
    (await api('/api/ideas?id=' + idea.id)).data.ideas[0].waters,
    original.data.ideas[0].waters,
  );
  assert.equal(
    (await change({ action: 'scenario', scenario: 'empty' })).data.counts.ideas,
    0,
  );
  await Promise.all([change({ action: 'undo' }), change({ action: 'undo' })]);
  assert.equal(
    (await api('/api/admin')).data.counts.ideas,
    8,
    'Concurrent Undo cannot clear the garden',
  );
  assert.equal(
    (await change({ action: 'scenario', scenario: 'full' })).data.counts.ideas,
    24,
  );
  const index = (await api('/api/ideas?garden=1')).data.grovePages[0],
    full = (await api('/api/ideas?garden=1&page=' + index)).data.ideas;
  assert.equal(full.length, 24);
  assert.ok(full.every((i) => i.waters === 25));
  assert.equal(
    (await change({ action: 'scenario', scenario: 'busy' })).data.counts.ideas,
    72,
  );
  assert.equal((await api('/api/ideas')).data.ideas.length, 50);
  assert.equal((await api('/api/ideas?page=1')).data.ideas.length, 22);
  console.log(
    'PASS: scenarios, aligned full grove, pagination, bounded like controls, transactional undo and safe action retries.',
  );
  const database = new DatabaseSync(await sqlFile('.preview/state'));
  try {
    database
      .prepare('UPDATE preview_identity SET value=? WHERE id=1')
      .run('preview-mismatched-database');
    assert.equal((await api('/api/admin')).status, 503);
    assert.equal(
      (await change({ action: 'scenario', scenario: 'empty' })).status,
      503,
    );
  } finally {
    database
      .prepare('UPDATE preview_identity SET value=? WHERE id=1')
      .run(config.PREVIEW_ID);
    database.close();
  }
  const checks = await runPreviewChecks(http);
  assert.equal(checks.length, 8);
  assert.ok(
    checks.every((c) => c.passed),
    JSON.stringify(checks),
  );
  assert.equal(
    (await api('/api/admin')).data.counts.ideas,
    72,
    'Check fixtures must be cleaned',
  );
  console.log(
    'PASS: database identity lock and eight real public-API browser checks, including fixture cleanup.',
  );
} finally {
  await change({ action: 'scenario', scenario: 'empty' });
}
const old = jar.get('garden_preview_admin');
assert.equal((await api('/api/admin/session', 'DELETE', {})).status, 200);
assert.equal(
  (
    await http('/api/admin', {
      headers: { Cookie: 'garden_preview_admin=' + old },
    })
  ).status,
  401,
  'Logout revokes the server session',
);
const ordinaryAfter = await (
  await fetch('http://localhost:3000/api/ideas')
).json();
assert.deepEqual(
  ordinaryAfter,
  ordinaryBefore,
  'The ordinary dev database must stay unchanged',
);
console.log(
  'PASS: session revocation and separation from the ordinary dev database.',
);
