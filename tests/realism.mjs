import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3, Matrix4 } from 'three';
import { TileBoundingVolume } from '3d-tiles-renderer/src/three/renderer/math/TileBoundingVolume.js';
import {
  ParkExtentPlugin,
  parkClippingPlanes,
} from '../features/park/realism/extent.ts';
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

void test('hosted imagery settings expose only the browser key, never other runtime secrets', async (t) => {
  const { createApiHarness } = await import('./helpers/api-harness.mjs');
  const mapsKey = 'test_browser_key_for_hosted_preview';
  const app = await createApiHarness({ preview: true, mapsKey });
  t.after(() => app.dispose());
  const result = await app.request('/api/park-provider');
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(result.data, { googleMapsKey: mapsKey, elevation: 300 });
  assert.ok(!result.text.includes(app.secret));
});

void test('park mask keeps ancestors and local tiles, rejects distant tiles without prefetching', () => {
  const frame = parkFrame(43.4672, -80.5325, 300);
  const plugin = new ParkExtentPlugin(frame.localToEarth);
  function check(x, z, radius) {
    const center = new Vector3(x * 30, 0, z * 30).applyMatrix4(
      frame.localToEarth,
    );
    const volume = new TileBoundingVolume();
    volume.setSphereData(center.x, center.y, center.z, radius, new Matrix4());
    const target = { inView: true };
    const changed = plugin.calculateTileViewError(
      { engineData: { boundingVolume: volume } },
      target,
    );
    return { changed, ...target };
  }
  assert.deepEqual(check(10, 4, 5), { changed: false, inView: true });
  assert.deepEqual(check(0, 0, 100000), { changed: false, inView: true });
  for (const [x, z] of [
    [40, 0],
    [-40, 0],
    [0, 35],
    [0, -35],
  ])
    assert.deepEqual(check(x, z, 10), { changed: true, inView: false });
  assert.deepEqual(
    check(21.1, 0, 10),
    { changed: false, inView: true },
    'boundary-spanning tiles still load',
  );
  const planes = parkClippingPlanes();
  assert.ok(planes.every((p) => p.distanceToPoint(new Vector3(10, 0, 4)) > 0));
  assert.ok(
    planes.some((p) => p.distanceToPoint(new Vector3(40, 0, 0)) < 0),
    'spanning geometry is clipped at the boundary',
  );
});
