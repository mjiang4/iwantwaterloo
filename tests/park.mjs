import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parkLight } from '../features/park/time.ts';
import { ideaTheme } from '../features/park/themes.ts';

void test('Waterloo light follows the actual sun and local clock, including daylight saving', () => {
  const noon = parkLight(Date.parse('2026-06-21T17:00:00Z'));
  const midnight = parkLight(Date.parse('2026-06-21T05:00:00Z'));
  assert.ok(noon.altitude > 65 && noon.altitude < 75);
  assert.ok(noon.azimuth > 150 && noon.azimuth < 200);
  assert.equal(noon.night, false);
  assert.ok(midnight.altitude < -15);
  assert.equal(midnight.night, true);
  assert.match(noon.clock, /1:00/);
  assert.match(parkLight(Date.parse('2026-12-21T17:00:00Z')).clock, /12:00/);
  const afternoon = parkLight(Date.parse('2026-06-21T22:00:00Z'));
  assert.ok(afternoon.sun[0] < 0, 'sun is west of the park in the afternoon');
  assert.ok(noon.sun[2] > 0, 'solar south maps to positive scene Z');
  assert.equal(parkLight(Date.now(), 'day').night, false);
  assert.equal(parkLight(Date.now(), 'night').night, true);
});

void test('theme suggestions support untagged ideas without changing their content', () => {
  const idea = {
    title: 'A place to lock my bike',
    description: 'Near the library.',
  };
  const before = JSON.stringify(idea);
  // Specific intent in the title should take precedence over a contextual place.
  assert.equal(ideaTheme(idea).id, 'movement');
  assert.equal(JSON.stringify(idea), before);
  assert.equal(
    ideaTheme({ title: 'More homes', description: 'For students.' }).id,
    'homes',
  );
});

void test('shipped park stays within the geometry budget and keeps the lake facing upward', async () => {
  const file = await readFile(
    new URL('../public/park/waterloo-park.glb', import.meta.url),
  );
  assert.ok(file.length < 2_000_000, 'base landscape must stay below 2 MB');
  const jsonSize = file.readUInt32LE(12);
  const model = JSON.parse(file.subarray(20, 20 + jsonSize).toString());
  assert.ok(
    model.nodes.every((n) => !/^(bark|leaf|fine-leaf)/.test(n.name || '')),
    'empty park has no decorative forest',
  );
  const map = JSON.parse(
    await readFile(new URL('../assets/park/map.json', import.meta.url)),
  );
  assert.equal(map.decorativeTreeCount, 0);
  for (const id of [865153056, 1165595580, 1165979047])
    assert.ok(
      map.pedestrianAreas.includes(id),
      'mapped boardwalks and plaza become filled surfaces',
    );
  assert.ok(model.meshes.reduce((n, m) => n + m.primitives.length, 0) <= 16);
  const mesh = model.meshes[model.nodes.find((n) => n.name === 'water').mesh];
  const accessor = model.accessors[mesh.primitives[0].attributes.NORMAL];
  const view = model.bufferViews[accessor.bufferView];
  const start =
    20 + jsonSize + 8 + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  assert.equal(accessor.componentType, 5126);
  for (let i = 0; i < accessor.count; i++)
    assert.ok(
      file.readFloatLE(start + i * (view.byteStride || 12) + 4) > 0.99,
      'water normals face skyward',
    );
});

void test('ION follows the mapped polyline and stays inside its endpoints', async () => {
  const { railPath } = await import('../features/park/rail-path.ts');
  const path = railPath([
    [0, 0],
    [3, 0],
    [3, 4],
  ]);
  assert.equal(path.length, 7);
  assert.deepEqual(path.at(2), { x: 2, z: 0, angle: Math.PI / 2 });
  assert.deepEqual(path.at(5), { x: 3, z: 2, angle: 0 });
  assert.equal(path.at(-5).x, 0);
  assert.equal(path.at(99).z, 4);
  assert.throws(() =>
    railPath([
      [1, 1],
      [1, 1],
    ]),
  );
  const landmarks = JSON.parse(
    await readFile(new URL('../assets/park/landmarks.json', import.meta.url)),
  );
  const mapped = railPath(landmarks.ion.points);
  assert.ok(mapped.length > 30 && mapped.length < 50);
  assert.equal(landmarks.perimeter.osmWay, 240741299);
  for (let distance = 0; distance < mapped.length; distance += 0.1) {
    const p = mapped.at(distance);
    assert.ok(
      Number.isFinite(p.angle) && Number.isFinite(p.x) && Number.isFinite(p.z),
    );
  }
});

void test('optional detail is compressed and bounded; base landmarks remain lightweight', async () => {
  const assets = new URL('../public/park/', import.meta.url);
  const detail = await readFile(new URL('waterloo-park-detail.glb', assets));
  assert.ok(detail.length < 6_000_000);
  const gltf = JSON.parse(detail.subarray(20, 20 + detail.readUInt32LE(12)));
  assert.ok(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'));
  assert.ok(
    gltf.nodes.every(
      (n) => !/^(bark|leaf|detailed-fine-leaf)/.test(n.name || ''),
    ),
    'detail mode also starts without trees',
  );
  const primitives = gltf.meshes.flatMap((mesh) => mesh.primitives);
  assert.ok(primitives.length <= 32);
  assert.ok(
    primitives.reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0) <
      550_000,
  );
  const landmarks = JSON.parse(
    await readFile(new URL('../assets/park/landmarks.json', import.meta.url)),
  );
  assert.equal(
    landmarks.detailBytes,
    detail.length,
    'warning follows the actual export size',
  );
  const baseBytes = (
    await Promise.all(
      ['waterloo-park.glb', 'perimeter.glb', 'ion-track.glb'].map(
        async (name) => (await readFile(new URL(name, assets))).length,
      ),
    )
  ).reduce((a, b) => a + b, 0);
  assert.ok(baseBytes < 2_500_000);
});
