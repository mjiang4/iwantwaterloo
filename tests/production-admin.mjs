import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';
const owners = ['jerry@unrepped.co', 'jerry@akatos.com'];
const password = 'Test8!ab';
const hash = (t) => createHash('sha256').update(t).digest('hex');
const encoded = () => {
  const salt = randomBytes(16).toString('hex');
  return (
    'scrypt-v1:' +
    salt +
    ':' +
    scryptSync(password, salt, 32, {
      N: 16384,
      r: 8,
      p: 5,
      maxmem: 33554432,
    }).toString('hex')
  );
};
async function mint(
  site,
  email,
  kind = 'password-setup',
  expires = Date.now() + 60000,
) {
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
  await site.db
    .prepare(
      'INSERT OR IGNORE INTO admin_passwords(email,password_hash,updated_at) VALUES (?,?,?)',
    )
    .bind(email, encoded(), Date.now())
    .run();
  const result = await site.request('/api/manage/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(result.response.status, 200, result.text);
  return result.response.headers.get('set-cookie').split(';')[0];
}
test('password login rejects unlisted, wrong, cross-origin and retired magic links; logout revokes', async () => {
  const site = await createApiHarness();
  try {
    for (const path of ['ideas', 'members', 'session'])
      assert.equal(
        (await site.request('/api/manage/' + path)).response.status,
        401,
      );
    for (const email of [owners[0], 'outsider@example.com'])
      assert.equal(
        (
          await site.request('/api/manage/login', {
            method: 'POST',
            body: { email, password: 'wrong' },
          })
        ).response.status,
        401,
      );
    const cookie = await auth(site);
    assert.equal(
      (
        await site.request('/api/manage/login', {
          method: 'POST',
          body: { email: owners[1], password },
          requestOrigin: 'https://evil.test',
        })
      ).response.status,
      403,
    );
    assert.equal(
      (
        await site.request('/api/manage/session', {
          method: 'POST',
          body: { token: await mint(site, owners[0], 'link') },
        })
      ).response.status,
      401,
    );
    assert.equal(
      (await site.request('/api/manage/session', { cookie })).data.email,
      owners[0],
    );
    assert.equal(
      (
        await site.request('/api/manage/session', {
          method: 'DELETE',
          cookie,
          body: {},
        })
      ).response.status,
      200,
    );
    assert.equal(
      (await site.request('/api/manage/session', { cookie })).response.status,
      401,
    );
    await site.request('/api/manage/login', {
      method: 'POST',
      body: { email: owners[0], password: 'wrong' },
    });
    assert.equal(
      (
        await site.request('/api/manage/login', {
          method: 'POST',
          body: { email: owners[0], password: 'wrong' },
        })
      ).response.status,
      429,
    );
  } finally {
    await site.dispose();
  }
});
test('private first-owner setup cannot be claimed without token, replayed or overwrite passwords', async () => {
  const token = randomBytes(32).toString('hex'),
    site = await createApiHarness({ bootstrapHash: hash(token) });
  try {
    const body = { email: owners[0], password, token };
    assert.equal(
      (
        await site.request('/api/manage/setup', {
          method: 'POST',
          body: { ...body, token: '0'.repeat(64) },
        })
      ).response.status,
      401,
    );
    assert.equal(
      (
        await site.request('/api/manage/setup', {
          method: 'POST',
          body: { ...body, email: 'outsider@example.com' },
        })
      ).response.status,
      401,
    );
    assert.equal(
      (
        await site.request('/api/manage/setup', {
          method: 'POST',
          body,
          requestOrigin: 'https://evil.test',
        })
      ).response.status,
      403,
    );
    const results = await Promise.all(
      [1, 2].map(() =>
        site.request('/api/manage/setup', { method: 'POST', body }),
      ),
    );
    assert.deepEqual(results.map((r) => r.response.status).sort(), [200, 409]);
    const rows = (await site.db.prepare('SELECT * FROM admin_passwords').all())
      .results;
    assert.equal(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes(password));
    assert.ok(rows[0].password_hash.startsWith('scrypt-v1:'));
    assert.equal(
      (
        await site.request('/api/manage/setup', {
          method: 'POST',
          body: { ...body, email: owners[1] },
        })
      ).response.status,
      409,
    );
  } finally {
    await site.dispose();
  }
});
test('invites set passwords once; password change requires old password and revokes sessions', async () => {
  const site = await createApiHarness();
  try {
    const cookie = await auth(site),
      email = 'new@example.com';
    const invite = await site.request('/api/manage/members', {
      method: 'POST',
      cookie,
      body: { email },
    });
    const token = new URLSearchParams(
      new URL(invite.data.setupUrl).hash.slice(1),
    ).get('setup');
    assert.ok(token);
    assert.equal(
      (
        await site.request('/api/manage/setup', {
          method: 'POST',
          body: { email, password, token },
        })
      ).response.status,
      200,
    );
    assert.equal(
      (
        await site.request('/api/manage/setup', {
          method: 'POST',
          body: { email, password, token },
        })
      ).response.status,
      401,
    );
    const session = await site.request('/api/manage/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(session.response.status, 200, session.text);
    const nc = session.response.headers.get('set-cookie').split(';')[0];
    await site.db.prepare('DELETE FROM rate_limits').run();
    assert.equal(
      (
        await site.request('/api/manage/password', {
          method: 'POST',
          cookie: nc,
          body: {
            currentPassword: 'wrong',
            password: 'A different long passphrase',
          },
        })
      ).response.status,
      403,
    );
    assert.equal(
      (
        await site.request('/api/manage/password', {
          method: 'POST',
          cookie: nc,
          body: {
            currentPassword: password,
            password: 'A different long passphrase',
          },
        })
      ).response.status,
      200,
    );
    assert.equal(
      (await site.request('/api/manage/session', { cookie: nc })).response
        .status,
      401,
    );
    const changed = await site.request('/api/manage/login', {
      method: 'POST',
      body: { email, password: 'A different long passphrase' },
    });
    assert.equal(changed.response.status, 200, changed.text);
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
        await site.request('/api/manage/setup', {
          method: 'POST',
          body: { token: pending, email, password },
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
