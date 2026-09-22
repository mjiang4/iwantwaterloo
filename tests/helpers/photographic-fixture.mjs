/** Original synthetic geometry for integration tests, never Google imagery or a visual mockup. */
import { Matrix4 } from 'three';
import { parkFrame } from '../../features/park/realism/frame.ts';
export const fixtureCredit = 'Original integration fixture <b>not imagery</b>';
export const fixtureKey = 'test_browser_key_1234567890';
export function photographicFixture() {
  const positions = new Float32Array([
    -1200, 60, -1200, -1200, 60, 1200, 1200, 60, 1200, 1200, 60, -1200,
  ]);
  const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const binary = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(normals.buffer),
    Buffer.from(indices.buffer),
  ]);
  const gltf = {
    asset: { version: '2.0', copyright: fixtureCredit },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.16, 0.33, 0.18, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      },
    ],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48 },
      { buffer: 0, byteOffset: 48, byteLength: 48 },
      { buffer: 0, byteOffset: 96, byteLength: 12 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [-1200, 60, -1200],
        max: [1200, 60, 1200],
      },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const glb = Buffer.alloc(12 + 8 + padded.length + 8 + binary.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(glb, 20);
  glb.writeUInt32LE(binary.length, 20 + padded.length);
  glb.writeUInt32LE(0x004e4942, 24 + padded.length);
  binary.copy(glb, 28 + padded.length);
  // The tileset is Z-up; glTF is Y-up. This is the same declared-axis conversion
  // used by real tiles, independently of the app's east/up/south park transform.
  const transform = parkFrame(43.4672, -80.5325, 300).localToEarth.multiply(
    new Matrix4().makeRotationX(-Math.PI / 2),
  );
  let root = {
    asset: { version: '1.1', gltfUpAxis: 'Y' },
    geometricError: 1,
    root: {
      transform: transform.toArray(),
      boundingVolume: { box: [0, 0, 0, 1200, 0, 0, 0, 1200, 0, 0, 0, 100] },
      geometricError: 0.5,
      refine: 'REPLACE',
      content: {
        uri: 'https://tile.googleapis.com/v1/3dtiles/fixture.glb?session=fixture',
      },
    },
  };
  const local = root.root;
  root.root = {
    boundingVolume: { sphere: [0, 0, 0, 7000000] },
    geometricError: 100000,
    refine: 'REPLACE',
    children: [
      local,
      {
        transform: transform.toArray(),
        boundingVolume: { box: [4500, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 100] },
        geometricError: 1,
        content: {
          uri: 'https://tile.googleapis.com/v1/3dtiles/outside.glb?session=fixture',
        },
      },
    ],
  };
  // Google can require hundreds of tiny metadata tilesets before any geometry.
  // Retaining this chain catches cache limits that stall before the first mesh.
  const metadata = [];
  for (let i = 0; i < 280; i++) {
    metadata.push(root);
    root = {
      asset: { version: '1.1' },
      geometricError: 100000,
      root: {
        boundingVolume: { sphere: [0, 0, 0, 7000000] },
        geometricError: 100000,
        content: {
          uri:
            'https://tile.googleapis.com/v1/3dtiles/metadata/' +
            i +
            '.json?session=fixture',
        },
      },
    };
  }
  return { root, glb, metadata };
}
