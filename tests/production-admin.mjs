import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';
const owners = ['jerry@unrepped.co', 'jerry@akatos.com'];
const hash = (t) => createHash('sha256').update(t).digest('hex');
async function mint(site, email, kind = 'link', expires = Date.now() + 60000) {
  const token = randomBytes(32).toString('hex');
  await site.db
    .prepare(
      'INSERT INTO admin_tokens(hash,email,kind,expires_at) VALUES (?,?,?,?)',
    )
    .bind(hash(token), email, kind, expires)
    .run();
  return token;
}
async function auth(site, email = owners[0]) {
  const token = await mint(site, email);
  const result = await site.request('/api/manage/session', {
    method: 'POST',
    body: { token },
  });
  assert.equal(result.response.status, 200, result.text);
  return result.response.headers.get('set-cookie').split(';')[0];
}
test('allowlist, safe email delivery, failed sends, rate limits and cross-origin protection', async () => {
  const mail = [];
  let fail = false;
  const site = await createApiHarness({
    emailDelivery: async (r) => {
      assert.equal(r.url, 'https://api.resend.com/emails');
      assert.ok(r.headers.get('idempotency-key'));
      mail.push(await r.json());
      return Response.json(fail ? { error: 'no' } : { id: 'test' }, {
        status: fail ? 503 : 200,
      });
    },
  });
  try {
    const denied = await site.request('/api/manage/login', {
      method: 'POST',
      body: { email: 'visitor@example.com' },
    });
    assert.equal(denied.response.status, 200);
    assert.equal(mail.length, 0);
    for (const email of owners) {
      const sent = await site.request('/api/manage/login', {
        method: 'POST',
        body: { email: ' ' + email.toUpperCase() + ' ' },
      });
      assert.equal(sent.response.status, 200, sent.text);
      assert.deepEqual(sent.data, denied.data);
    }
    assert.deepEqual(
      mail.map((m) => m.to[0]),
      owners,
    );
    const link = mail[0].text.match(/https:\/\/\S+/)[0];
    assert.equal(new URL(link).origin, 'https://garden.example.test');
    assert.equal(new URL(link).search, '');
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
    const rows = (await site.db.prepare('SELECT * FROM admin_tokens').all())
      .results;
    assert.ok(rows.some((r) => r.hash === hash(token)));
    assert.ok(!JSON.stringify(rows).includes(token));
    assert.equal(
      (
        await site.request('/api/manage/login', {
          method: 'POST',
          body: { email: owners[0] },
          requestOrigin: 'https://evil.test',
        })
      ).response.status,
      403,
    );
    fail = true;
    const count = (
      await site.db.prepare('SELECT count(*) AS n FROM admin_tokens').first()
    ).n;
    assert.equal(
      (
        await site.request('/api/manage/login', {
          method: 'POST',
          body: { email: owners[1] },
        })
      ).response.status,
      503,
    );
    assert.equal(
      (await site.db.prepare('SELECT count(*) AS n FROM admin_tokens').first())
        .n,
      count,
    );
    fail = false;
    await site.request('/api/manage/login', {
      method: 'POST',
      body: { email: owners[0] },
    });
    await site.request('/api/manage/login', {
      method: 'POST',
      body: { email: owners[0] },
    });
    assert.equal(
      (
        await site.request('/api/manage/login', {
          method: 'POST',
          body: { email: owners[0] },
        })
      ).response.status,
      429,
    );
  } finally {
    await site.dispose();
  }
});
test('links expire, are single-use under races, require allowlist, and logout revokes sessions', async () => {
  const site = await createApiHarness();
  try {
    for (const path of ['ideas', 'members', 'session'])
      assert.equal(
        (await site.request('/api/manage/' + path)).response.status,
        401,
      );
    assert.equal(
      (
        await site.request('/api/manage/login', {
          method: 'POST',
          body: { email: owners[0] },
        })
      ).response.status,
      503,
    );
    const expired = await mint(site, owners[0], 'link', Date.now() - 1000);
    assert.equal(
      (
        await site.request('/api/manage/session', {
          method: 'POST',
          body: { token: expired },
        })
      ).response.status,
      401,
    );
    const unlisted = await mint(site, 'outsider@example.com');
    assert.equal(
      (
        await site.request('/api/manage/session', {
          method: 'POST',
          body: { token: unlisted },
        })
      ).response.status,
      401,
    );
    const token = await mint(site, owners[0]);
    assert.equal(
      (
        await site.request('/api/manage/session', {
          method: 'POST',
          body: { token },
          requestOrigin: 'https://evil.test',
        })
      ).response.status,
      403,
    );
    const results = await Promise.all(
      [1, 2].map(() =>
        site.request('/api/manage/session', {
          method: 'POST',
          body: { token },
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.response.status).sort(), [200, 401]);
    const success = results.find((r) => r.response.status === 200),
      header = success.response.headers.get('set-cookie');
    assert.ok(header.includes('HttpOnly'));
    assert.ok(header.includes('SameSite=Lax'));
    const cookie = header.split(';')[0];
    assert.equal(
      (await site.request('/api/manage/session', { cookie })).data.email,
      owners[0],
    );
    assert.equal(
      (
        await site.request('/api/manage/session', {
          method: 'DELETE',
          body: {},
          cookie,
        })
      ).response.status,
      200,
    );
    assert.equal(
      (await site.request('/api/manage/session', { cookie })).response.status,
      401,
    );
  } finally {
    await site.dispose();
  }
});
test('only admins can manage access; revocation invalidates pending links and sessions; owners stay', async () => {
  const site = await createApiHarness();
  try {
    const cookie = await auth(site),
      email = 'added@example.com';
    assert.equal(
      (
        await site.request('/api/manage/members', {
          method: 'POST',
          body: { email },
        })
      ).response.status,
      401,
    );
    assert.equal(
      (
        await site.request('/api/manage/members', {
          method: 'POST',
          body: { email },
          cookie,
          requestOrigin: 'https://evil.test',
        })
      ).response.status,
      403,
    );
    assert.equal(
      (
        await site.request('/api/manage/members', {
          method: 'POST',
          body: { email },
          cookie,
        })
      ).response.status,
      200,
    );
    const addedCookie = await auth(site, email),
      pending = await mint(site, email);
    assert.equal(
      (await site.request('/api/manage/members', { cookie })).data.admins
        .length,
      3,
    );
    assert.equal(
      (
        await site.request('/api/manage/members', {
          method: 'DELETE',
          body: { email: owners[0] },
          cookie,
        })
      ).response.status,
      400,
    );
    assert.equal(
      (
        await site.request('/api/manage/members', {
          method: 'DELETE',
          body: { email },
          cookie,
        })
      ).response.status,
      200,
    );
    assert.equal(
      (await site.request('/api/manage/session', { cookie: addedCookie }))
        .response.status,
      401,
    );
    assert.equal(
      (
        await site.request('/api/manage/session', {
          method: 'POST',
          body: { token: pending },
        })
      ).response.status,
      401,
    );
  } finally {
    await site.dispose();
  }
});
test('confirmed idea deletion removes dependent rows and preserves unrelated data', async () => {
  const site = await createApiHarness();
  try {
    const visitor = await site.browser();
    const make = async (description) =>
      (
        await visitor.request('/api/ideas', {
          method: 'POST',
          body: ideaPayload({ description }),
        })
      ).data.idea;
    const target = await make('Remove only this particular test idea.'),
      keep = await make('Keep this separate idea safe.');
    const comment = randomUUID();
    await site.db
      .prepare(
        'INSERT INTO comments(id,idea_id,body,created_at,visitor_id) VALUES (?,?,?,?,?)',
      )
      .bind(comment, target.id, 'reply', Date.now(), 'visitor')
      .run();
    await site.db
      .prepare(
        'INSERT INTO supports(idea_id,visitor_id,created_at) VALUES (?,?,?)',
      )
      .bind(target.id, 'visitor', Date.now())
      .run();
    await site.db
      .prepare(
        'INSERT INTO reports(id,comment_id,reason,visitor_id,created_at) VALUES (?,?,?,?,?)',
      )
      .bind(randomUUID(), comment, 'test', 'visitor', Date.now())
      .run();
    const cookie = await auth(site);
    assert.equal(
      (
        await site.request(
          '/api/manage/ideas?' + new URLSearchParams({ q: 'particular' }),
          { cookie },
        )
      ).data.ideas.length,
      1,
    );
    const body = { id: target.id, confirm: true };
    assert.equal(
      (await site.request('/api/manage/ideas', { method: 'DELETE', body }))
        .response.status,
      401,
    );
    assert.equal(
      (
        await site.request('/api/manage/ideas', {
          method: 'DELETE',
          cookie,
          body,
          requestOrigin: 'https://evil.test',
        })
      ).response.status,
      403,
    );
    assert.equal(
      (
        await site.request('/api/manage/ideas', {
          method: 'DELETE',
          cookie,
          body: { id: target.id },
        })
      ).response.status,
      400,
    );
    assert.equal(
      (
        await site.request('/api/manage/ideas', {
          method: 'DELETE',
          cookie,
          body,
        })
      ).data.removed,
      1,
    );
    assert.equal(
      (
        await site.request('/api/manage/ideas', {
          method: 'DELETE',
          cookie,
          body,
        })
      ).data.removed,
      0,
    );
    assert.deepEqual(
      (await site.db.prepare('SELECT id FROM ideas').all()).results.map(
        (r) => r.id,
      ),
      [keep.id],
    );
    for (const table of ['comments', 'supports', 'reports'])
      assert.equal(
        (await site.db.prepare('SELECT count(*) AS n FROM ' + table).first()).n,
        0,
      );
    assert.equal(
      (
        await site.db
          .prepare(
            "SELECT count(*) AS n FROM admin_audit WHERE action='delete-idea'",
          )
          .first()
      ).n,
      2,
    );
  } finally {
    await site.dispose();
  }
});
