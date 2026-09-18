import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  growthForLikes,
  growthStretch,
  plantingScale,
  seedForId,
  randomAt,
  plotPosition,
  clusterTargets,
} from '../lib/garden-visuals.ts';

void test('growth stays monotonic, bounded and reversible, including malformed counts', () => {
  const sapling = growthForLikes(0);
  assert.equal(sapling.height, 0.78);
  assert.equal(sapling.flowers, 0);
  let previous = sapling;
  for (let likes = 1; likes <= 1000; likes++) {
    const next = growthForLikes(likes);
    for (const key of Object.keys(next)) assert.ok(next[key] >= previous[key]);
    assert.ok(next.height < 2.13);
    assert.ok(next.fullness < 1.07);
    assert.ok(next.flowers <= 12);
    assert.ok(next.branches <= 2);
    previous = next;
  }
  for (const n of [1, 10, 25, 100, 1000, 1000000])
    assert.ok(growthForLikes(n + 1).height > growthForLikes(n).height);
  assert.ok(growthForLikes(1).height > sapling.height * 1.4);
  for (const invalid of [-4, NaN, Infinity])
    assert.deepEqual(growthForLikes(invalid), sapling);
  assert.ok(growthForLikes(9).flowers < growthForLikes(10).flowers);
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
  for (let i = 0; i < 24; i++)
    assert.deepEqual(plotPosition(i), plotPosition(i + 24));
});

void test('crowded mobile targets keep every idea and leave 48px hit areas separate', () => {
  for (const spread of [0, 20, 50, 100, 400]) {
    const input = Array.from({ length: 24 }, (_, index) => ({
      index,
      x: randomAt(44, index) * spread,
      y: randomAt(77, index) * spread,
    }));
    const result = clusterTargets(input);
    assert.deepEqual(
      result.flatMap((group) => group.indices).sort((a, b) => a - b),
      input.map((p) => p.index),
    );
    for (let a = 0; a < result.length; a++)
      for (let b = a + 1; b < result.length; b++) {
        assert.ok(
          Math.abs(result[a].x - result[b].x) >= 52 ||
            Math.abs(result[a].y - result[b].y) >= 52,
        );
      }
  }
  assert.deepEqual(clusterTargets([]), []);
});

void test('planting rises quickly above its final size, then settles without undershooting', () => {
  assert.equal(plantingScale(0), 0.025);
  assert.ok(plantingScale(0.24) > 1.2);
  assert.ok(plantingScale(0.65) < plantingScale(0.24));
  assert.equal(plantingScale(1), 1);
  for (let i = 0; i <= 100; i++)
    assert.ok(plantingScale(i / 100) > 0 && plantingScale(i / 100) <= 1.24);
});
