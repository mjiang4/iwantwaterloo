import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createApiHarness, ideaPayload } from './helpers/api-harness.mjs';

const keys = [
  'sexual',
  'sexual/minors',
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'violence/graphic',
  'illicit/violent',
  'self-harm/instructions',
];
/** Screening that flags any text containing "FLAG" as harassment. */
async function screen(request) {
  const { input } = await request.json();
  const flagged = String(input).includes('FLAG');
  return Response.json({
    results: [
      {
        categories: Object.fromEntries(
          keys.map((k) => [k, flagged && k === 'harassment']),
        ),
        category_scores: Object.fromEntries(
          keys.map((k) => [k, flagged && k === 'harassment' ? 0.99 : 0]),
        ),
      },
    ],
  });
}
async function admin(site) {
  const token = randomBytes(32).toString('hex');
  await site.db
    .prepare(
      'INSERT INTO admin_tokens(hash,email,kind,expires_at) VALUES (?,?,?,?)',
    )
    .bind(
      createHash('sha256').update(token).digest('hex'),
      'jerry@unrepped.co',
      'session',
      Date.now() + 60000,
    )
    .run();
  return 'garden_admin_local=' + token;
}
const love = (body) => ({
  body,
  x: 12.9,
  z: 7,
  landmark: 'silver-lake',
  displayName: '',
  submissionKey: randomUUID(),
});
const update = (ideaId, description, version = 0) => ({
  ideaId,
  version,
  description,
  question: 'What would make this work well?',
  note: 'Added detail from the replies.',
  credits: [],
  submissionKey: randomUUID(),
});
async function queue(site, cookie) {
  return (await site.request('/api/manage/review', { cookie })).data.items;
}

void test('flagged loves wait for review and only bloom once approved', async (t) => {
  const site = await createApiHarness({ moderation: screen });
  t.after(() => site.dispose());
  const visitor = await site.browser();
  const held = await visitor.request('/api/loves', {
    method: 'POST',
    body: love('FLAG this is abuse in the park'),
  });
  assert.equal(held.response.status, 201);
  assert.equal(held.data.love.moderationState, 'pending');
  const fine = await visitor.request('/api/loves', {
    method: 'POST',
    body: love('The boardwalk at sunset.'),
  });
  assert.equal(fine.data.love.moderationState, 'visible');
  const listed = () =>
    site.request('/api/loves').then((r) => r.data.loves.map((l) => l.id));
  assert.deepEqual(await listed(), [fine.data.love.id]);
  // Nobody can echo or report a love that is still held.
  assert.equal(
    (
      await visitor.request('/api/loves/echo', {
        method: 'PUT',
        body: { loveId: held.data.love.id, echoed: true },
      })
    ).response.status,
    404,
  );
  const cookie = await admin(site);
  const item = (await queue(site, cookie)).find(
    (i) => i.id === held.data.love.id,
  );
  assert.equal(item.kind, 'love');
  assert.match(item.body, /FLAG/);
  const approve = () =>
    site.request('/api/manage/review', {
      method: 'POST',
      cookie,
      body: { id: held.data.love.id, kind: 'love', action: 'approve' },
    });
  assert.equal((await approve()).response.status, 200);
  assert.equal((await approve()).response.status, 409, 'reviewed once');
  assert.deepEqual(
    new Set(await listed()),
    new Set([fine.data.love.id, held.data.love.id]),
  );
});

void test('author updates are screened before they replace the public text', async (t) => {
  const site = await createApiHarness({ moderation: screen });
  t.after(() => site.dispose());
  const author = await site.browser();
  const { idea } = (
    await author.request('/api/ideas', { method: 'POST', body: ideaPayload() })
  ).data;
  const original = idea.description;
  const publicText = async () =>
    (await site.request('/api/ideas?id=' + idea.id)).data.ideas[0];
  const activity = () => site.request('/api/activity?ideaId=' + idea.id);

  // A flagged update is accepted but held: the public keeps the screened text.
  const held = await author.request('/api/activity', {
    method: 'POST',
    body: update(idea.id, 'FLAG replace the idea with abuse.'),
  });
  assert.equal(held.response.status, 200);
  assert.equal(held.data.moderationState, 'pending');
  assert.equal((await publicText()).description, original);
  assert.equal((await publicText()).version, 0);
  assert.equal((await activity()).data.activities.length, 0);

  // The author can keep editing from the visible version while one is held.
  const clean = await author.request('/api/activity', {
    method: 'POST',
    body: update(idea.id, 'Covered seating near the library, with lights.'),
  });
  assert.equal(clean.data.moderationState, 'visible');
  assert.equal(
    (await publicText()).description,
    'Covered seating near the library, with lights.',
  );

  // Moderators see the held update's full text and decide; hiding keeps it private.
  const cookie = await admin(site);
  const item = (await queue(site, cookie)).find((i) => i.kind === 'update');
  assert.match(item.body, /FLAG/);
  assert.match(item.body, /What changed: Added detail/);
  assert.equal(
    (
      await site.request('/api/manage/review', {
        method: 'POST',
        cookie,
        body: { id: item.id, kind: 'update', action: 'dismiss' },
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await publicText()).description,
    'Covered seating near the library, with lights.',
  );
  assert.ok(
    (await activity()).data.activities.every(
      (a) => !String(a.description).includes('FLAG'),
    ),
  );
});

void test('hidden and pending ideas stay private everywhere, including activity', async (t) => {
  const site = await createApiHarness({ moderation: screen });
  t.after(() => site.dispose());
  const author = await site.browser();
  const pending = (
    await author.request('/api/ideas', {
      method: 'POST',
      body: ideaPayload({
        title: 'FLAG abusive title here',
        description: 'FLAG abusive idea text.',
      }),
    })
  ).data.idea;
  assert.equal(pending.moderationState, 'pending');
  assert.equal(
    (await site.request('/api/activity?ideaId=' + pending.id)).response.status,
    404,
  );
  // An author cannot slip new text onto an idea that is awaiting review.
  assert.equal(
    (
      await author.request('/api/activity', {
        method: 'POST',
        body: update(pending.id, 'Different text written after the hold.'),
      })
    ).response.status,
    404,
  );
  // Place is a fixed choice, never unscreened free text.
  assert.equal(
    (
      await author.request('/api/ideas', {
        method: 'POST',
        body: ideaPayload({ place: 'anything I like' }),
      })
    ).response.status,
    400,
  );
});
