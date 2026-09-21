import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { parkFrame } from '../features/park/realism/frame.ts';
import { parseParkProvider } from '../features/park/realism/provider.ts';

void test('photographic frame preserves WGS84 positions, east/up/south and metre scale', () => {
  const equator = parkFrame(0, 0, 0);
  const origin = new Vector3(6378137, 0, 0);
  assert.ok(origin.clone().applyMatrix4(equator.earthToPark).length() < 1e-8);
  for (const [earth, park] of [
    [
      [6378137, 30, 0],
      [1, 0, 0],
    ],
    [
      [6378167, 0, 0],
      [0, 1, 0],
    ],
    [
      [6378137, 0, -30],
      [0, 0, 1],
    ],
  ]) {
    assert.ok(
      new Vector3(...earth)
        .applyMatrix4(equator.earthToPark)
        .distanceTo(new Vector3(...park)) < 1e-8,
    );
  }
  const frame = parkFrame(43.4672, -80.5325, 300);
  const point = new Vector3(330, 18, -210);
  const roundtrip = point
    .clone()
    .applyMatrix4(frame.localToEarth)
    .applyMatrix4(frame.earthToPark);
  assert.ok(roundtrip.distanceTo(point.divideScalar(30)) < 1e-8);
  assert.ok(Math.abs(frame.localToEarth.determinant() - 1) < 1e-10);
});

void test('public imagery configuration fails closed and does not return unrelated credentials', () => {
  for (const input of [
    undefined,
    null,
    [],
    'key',
    { googleMapsKey: '<script>' },
    { googleMapsKey: 42 },
  ])
    assert.equal(parseParkProvider(input).googleMapsKey, '');
  const key = 'test_browser_key_1234567890';
  assert.deepEqual(
    parseParkProvider({
      googleMapsKey: key,
      elevation: 325,
      adminSecret: 'private',
    }),
    { googleMapsKey: key, elevation: 325 },
  );
  for (const elevation of [NaN, Infinity, -12, 12000, '300'])
    assert.equal(parseParkProvider({ elevation }).elevation, 300);
});
