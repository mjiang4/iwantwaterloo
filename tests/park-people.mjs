import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  MIN_PEOPLE,
  PEOPLE_CAP,
  nearestNode,
  parseGraph,
  peopleTarget,
  pickWeighted,
  route,
} from '../features/park/people-graph.ts';
import bounds from '../features/park/bounds.json' with { type: 'json' };

const graph = parseGraph(
  JSON.parse(readFileSync('public/park/paths.json', 'utf8')),
);

void test('one person per recent contributor, within the device cap', () => {
  assert.equal(peopleTarget(0, 'full', 0), MIN_PEOPLE, 'never empty');
  assert.equal(peopleTarget(20, 'full', 0), 20);
  assert.equal(peopleTarget(500, 'full', 0), PEOPLE_CAP.full);
  assert.equal(peopleTarget(500, 'phone', 0), PEOPLE_CAP.phone);
  assert.equal(peopleTarget(500, 'lite', 0), 0, 'stripped-down: no people');
  assert.equal(peopleTarget(0, 'lite', 1), 0);
});

void test('most people head home after dark; a few stay under the lanterns', () => {
  assert.equal(peopleTarget(30, 'full', 1), 10);
  assert.ok(peopleTarget(30, 'full', 0.5) < 30);
  assert.equal(peopleTarget(0, 'phone', 1), 2, 'never fewer than two');
});

void test('the footpath network is connected, inside the park, with gates', () => {
  assert.ok(graph.x.length > 500);
  assert.ok(graph.gates.length >= 4);
  for (let i = 0; i < graph.x.length; i++) {
    assert.ok(graph.x[i] > bounds.west && graph.x[i] < bounds.east);
    assert.ok(graph.z[i] > bounds.north && graph.z[i] < bounds.south);
  }
  // Every junction can reach every gate: nobody gets stranded.
  const from = nearestNode(graph, 0, 0);
  for (const gate of graph.gates) {
    const walk = route(graph, from, gate);
    assert.equal(walk[0], from);
    assert.equal(walk.at(-1), gate);
    for (let i = 1; i < walk.length; i++)
      assert.ok(graph.neighbours[walk[i - 1]].includes(walk[i]));
  }
});

void test('busier trees are visited more often', () => {
  const trees = [
    { id: 'quiet', weight: 1 },
    { id: 'busy', weight: 9 },
  ];
  let busy = 0;
  for (let i = 0; i < 1000; i++)
    if (pickWeighted(trees, (t) => t.weight, (i + 0.5) / 1000)?.id === 'busy')
      busy++;
  assert.equal(busy, 900);
});

void test('the garden reports recent contributing browsers as a count only', async (t) => {
  const { createApiHarness } = await import('./helpers/api-harness.mjs');
  const { randomUUID } = await import('node:crypto');
  const app = await createApiHarness();
  t.after(() => app.dispose());
  const now = Date.now();
  const add = (visitor, ago, state = 'visible') =>
    app.db
      .prepare(
        'INSERT INTO ideas(id,title,description,category,created_at,visitor_id,moderation_state) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(randomUUID(), 'Tree', 'Tree', 'other', now - ago, visitor, state);
  const day = 86400000;
  await app.db.batch([
    add('a', day),
    add('a', 2 * day), // the same browser twice is one person
    add('b', 3 * day),
    add('c', 9 * day),
    add('d', 11 * day), // outside the 10-day window
    add('e', day, 'pending'), // held ideas never create people
    add('f', day, 'hidden'),
  ]);
  const garden = (await app.request('/api/ideas?garden=1')).data;
  assert.equal(garden.people, 3);
  assert.ok(garden.ideas.every((idea) => !('visitorId' in idea)));
  // Only the garden carries the count; the list doesn't need it.
  assert.equal('people' in (await app.request('/api/ideas')).data, false);
});
