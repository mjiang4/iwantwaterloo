#!/usr/bin/env node
// Meshopt-compress the models every visitor downloads, in place.
//
//   node scripts/park/compress_models.mjs
//
// Run after the Blender exports (build_landscape.py, build_detail.py). Meshopt
// cuts these files about 5x with no visible change, and three's GLTF loader
// already bundles its decoder, so nothing extra downloads. The opt-in detail
// model keeps Draco from Blender. Already-compressed files are skipped.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const MODELS = ['waterloo-park.glb', 'perimeter.glb', 'ion-track.glb'];
const CLI = '@gltf-transform/cli@4.5.1';

function compressed(path) {
  const glb = readFileSync(path);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)));
  return (json.extensionsUsed || []).includes('EXT_meshopt_compression');
}

for (const name of MODELS) {
  const path = `public/park/${name}`;
  if (compressed(path)) {
    console.log(`${name}: already compressed`);
    continue;
  }
  const before = statSync(path).size;
  execFileSync('npx', ['-y', CLI, 'meshopt', path, path], { stdio: 'ignore' });
  const after = statSync(path).size;
  console.log(
    `${name}: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`,
  );
}
