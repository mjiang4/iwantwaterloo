import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createButterflyVisit,
  inviteButterfly,
  advanceButterfly,
} from '../lib/garden-discovery.ts';

test('butterfly requires three eligible pond taps and cannot accumulate or replay', () => {
  const visit = createButterflyVisit();
  for (let i = 0; i < 20; i++) inviteButterfly(visit, false);
  assert.equal(visit.taps, 0);
  inviteButterfly(visit, true);
  inviteButterfly(visit, true);
  assert.equal(advanceButterfly(visit, 1 / 60, true), -1);
  inviteButterfly(visit, true);
  assert.equal(visit.seen, true);
  let visibleFrames = 0;
  for (let i = 0; i < 400; i++) {
    inviteButterfly(visit, true);
    const t = advanceButterfly(visit, 1 / 60, true);
    if (t >= 0) {
      assert.ok(t < 1);
      visibleFrames++;
    }
  }
  assert.ok(visibleFrames >= 298 && visibleFrames <= 301);
  assert.equal(visit.taps, 3);
  assert.equal(visit.elapsed, -1);
  for (let i = 0; i < 100; i++) inviteButterfly(visit, true);
  assert.equal(advanceButterfly(visit, 1 / 60, true), -1);
});

test('pause, offscreen or reduced detail cancels a flight without replay on resume', () => {
  const visit = createButterflyVisit();
  for (let i = 0; i < 3; i++) inviteButterfly(visit, true);
  assert.ok(advanceButterfly(visit, 0.02, true) >= 0);
  assert.equal(advanceButterfly(visit, 0.02, false), -1);
  inviteButterfly(visit, true);
  assert.equal(advanceButterfly(visit, 0.02, true), -1);
});

test('suspended clocks and malformed frame deltas cannot jump or poison the flight', () => {
  const visit = createButterflyVisit();
  for (let i = 0; i < 3; i++) inviteButterfly(visit, true);
  for (const delta of [NaN, Infinity, -1])
    assert.equal(advanceButterfly(visit, delta, true), 0);
  assert.equal(advanceButterfly(visit, 60, true), 0.01);
  assert.equal(visit.elapsed, 0.05);
});
