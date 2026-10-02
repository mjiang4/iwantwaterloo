import assert from 'node:assert/strict';
import { GROVE_SIZE } from '../lib/garden.ts';
import { test } from 'node:test';
import {
  growthForLikes,
  growthStretch,
  plantingScale,
  seedForId,
  randomAt,
  plotPosition,
  hitTreeTargets,
} from '../lib/garden-visuals.ts';

void test('growth stays monotonic, bounded and reversible, including malformed counts', () => {
  const sapling = growthForLikes(0);
  assert.equal(sapling.height, 1);
  assert.equal(sapling.flowers, 0);
  let previous = sapling;
  for (let likes = 1; likes <= 1000; likes++) {
    const next = growthForLikes(likes);
    for (const key of Object.keys(next)) assert.ok(next[key] >= previous[key]);
    assert.ok(next.height < 2.1);
    assert.ok(next.fullness < 1.15);
    assert.ok(next.flowers <= 12);
    assert.ok(next.branches <= 2);
    previous = next;
  }
  for (const n of [1, 10, 25, 100, 1000, 1000000])
    assert.ok(growthForLikes(n + 1).height > growthForLikes(n).height);
  assert.ok(growthForLikes(1).height > sapling.height * 1.2);
  for (const invalid of [-4, NaN, Infinity])
    assert.deepEqual(growthForLikes(invalid), sapling);
  assert.ok(growthForLikes(14).flowers < growthForLikes(15).flowers);
  assert.deepEqual(growthForLikes(0), sapling);
});

void test('each like can make a visible, finite stretch without changing final size', () => {
  assert.equal(growthStretch(0), 1);
  assert.equal(growthStretch(1), 1);
  assert.ok(growthStretch(0.18) >= 1.33);
  for (const n of [-1, 2, NaN, Infinity]) assert.equal(growthStretch(n), 1);
  for (let i = 0; i <= 100; i++)
    assert.ok(growthStretch(i / 100) >= 1 && growthStretch(i / 100) <= 1.34);
});

void test('tree identity and plots stay stable when lists are reordered or paged', () => {
  const ids = ['river', 'library', 'housing'];
  const original = new Map(ids.map((id) => [id, randomAt(seedForId(id), 12)]));
  for (const id of ids.reverse())
    assert.equal(randomAt(seedForId(id), 12), original.get(id));
  for (let i = 0; i < 48; i++)
    assert.deepEqual(plotPosition(i), plotPosition(i + 48));
});

void test('only overlapping targets at the actual tap need a chooser', () => {
  const targets = [
    { id: 'a', left: 0, top: 0, right: 48, bottom: 48 },
    { id: 'b', left: 24, top: 12, right: 72, bottom: 60 },
    { id: 'c', left: 100, top: 100, right: 148, bottom: 148 },
  ];
  assert.deepEqual(hitTreeTargets(targets, 12, 12), ['a']);
  assert.deepEqual(hitTreeTargets(targets, 30, 30), ['a', 'b']);
  assert.deepEqual(hitTreeTargets(targets, 120, 120), ['c']);
  assert.deepEqual(hitTreeTargets(targets, 90, 90), []);
});

void test('planting rises quickly above its final size, then settles without undershooting', () => {
  assert.equal(plantingScale(0), 0.025);
  assert.ok(plantingScale(0.24) > 1.2);
  assert.ok(plantingScale(0.65) < plantingScale(0.24));
  assert.equal(plantingScale(1), 1);
  for (let i = 0; i <= 100; i++)
    assert.ok(plantingScale(i / 100) > 0 && plantingScale(i / 100) <= 1.24);
});

void test('five likes adds fruit on a fuller tree; fifteen adds flowers', () => {
  assert.equal(growthForLikes(4).fruits, 0);
  assert.equal(growthForLikes(5).fruits, 3);
  assert.ok(growthForLikes(5).fullness - growthForLikes(4).fullness > 0.12);
  assert.equal(growthForLikes(14).flowers, 0);
  assert.equal(growthForLikes(15).flowers, 4);
  assert.equal(growthForLikes(1000000).fruits, 8);
  const plots = Array.from({ length: 48 }, (_, i) => plotPosition(i));
  assert.equal(new Set(plots.map((p) => p.join(','))).size, GROVE_SIZE);
  for (const [x, z] of plots)
    assert.ok(((x - 1.3) / 2.4) ** 2 + ((z - 0.1) / 1.7) ** 2 > 1);
});
