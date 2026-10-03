import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import bounds from '../features/park/bounds.json' with { type: 'json' };

const features = JSON.parse(readFileSync('assets/park/features.json', 'utf8'));
const inside = (x, z) =>
  x > bounds.west && x < bounds.east && z > bounds.north && z < bounds.south;

void test('park buildings carry a footprint box, roof style and material', () => {
  assert.ok(features.buildings.length >= 20);
  for (const b of features.buildings) {
    assert.ok(inside(b.x, b.z), `${b.name} inside the park`);
    assert.ok(b.length >= b.width && b.width >= 0.06, 'ridge on the long side');
    assert.ok(['gable', 'flat', 'shelter'].includes(b.roof));
    assert.ok(b.height >= 0.16 && b.height <= 0.5);
    if (b.roof === 'flat' && b.ring) assert.ok(b.ring.length >= 4);
  }
  // Perimeter has its own detailed model and is never drawn twice.
  assert.ok(features.buildings.every((b) => !/Perimeter/.test(b.name || '')));
  const named = (re) => features.buildings.find((b) => re.test(b.name || ''));
  assert.equal(named(/Grist Mill/).roof, 'gable');
  assert.equal(named(/Grist Mill/).material, 'stone');
  assert.equal(named(/School House/).material, 'log');
  assert.equal(named(/Park Inn/).material, 'inn');
  assert.equal(named(/Picnic Shelter/).roof, 'shelter');
});

void test('playgrounds and the Silver Lake shore are mapped for the park furniture', () => {
  assert.equal(features.playgrounds.length, 8);
  for (const p of features.playgrounds) assert.ok(inside(p.x, p.z));
  assert.ok(features.shore.length > 20);
});
