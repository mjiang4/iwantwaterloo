'use client';
/* oxlint-disable react/react-compiler -- Merged geometry and materials are owned by the renderer. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import features from '@/assets/park/features.json';

/** The park lawn's top surface in the base model. */
const LAWN_Y = 0.1;
const noRaycast = () => {};

type Building = (typeof features.buildings)[number] & {
  ring?: number[][];
};

/** Walls, roof and trim by material; named landmarks get their own character. */
const FINISH: Record<string, { wall: string; roof: string; trim: string }> = {
  stone: { wall: '#b9ac95', roof: '#5f5b57', trim: '#7d6e5c' },
  log: { wall: '#7d5537', roof: '#4e4843', trim: '#5a3c26' },
  inn: { wall: '#f0e4c8', roof: '#3f6a4f', trim: '#7b5a3c' },
  barn: { wall: '#a2432f', roof: '#5b6064', trim: '#efe3cc' },
  timber: { wall: '#8f6a45', roof: '#6b4f37', trim: '#5e4630' },
  modern: { wall: '#dbd8cf', roof: '#9a9e9b', trim: '#6f7a80' },
  cream: { wall: '#ece2cd', roof: '#a5573a', trim: '#7b5a3c' },
};
/** Cream buildings alternate warm terracotta and slate roofs, so the park isn't uniform. */
const CREAM_ROOFS = ['#a5573a', '#5f6b70', '#8a5a44'];

function paint(geometry: THREE.BufferGeometry, hex: string) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute('uv');
  const color = new THREE.Color(hex);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A gable prism: ridge along local X, eaves at y=0, ridge at y=rise. */
function gable(length: number, width: number, rise: number) {
  const l = length / 2,
    w = width / 2;
  // prettier-ignore
  const v = [
    // Two slopes.
    -l, 0, w,  l, 0, w,  l, rise, 0,   -l, 0, w,  l, rise, 0,  -l, rise, 0,
    l, 0, -w,  -l, 0, -w,  -l, rise, 0,   l, 0, -w,  -l, rise, 0,  l, rise, 0,
    // Gable ends.
    l, 0, w,  l, 0, -w,  l, rise, 0,
    -l, 0, -w,  -l, 0, w,  -l, rise, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Place a local geometry at a building's footprint centre and orientation. */
function place(g: THREE.BufferGeometry, b: Building, y = 0) {
  g.rotateY(-b.angle);
  g.translate(b.x, y, b.z);
  return g;
}

function hash(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** One building as walls (+ door and trim), roof, and windows, in world space. */
function buildingParts(b: Building) {
  const finish = FINISH[b.material] ?? FINISH.cream;
  const roofColor =
    b.material === 'cream'
      ? CREAM_ROOFS[hash(`${b.x},${b.z}`) % CREAM_ROOFS.length]
      : finish.roof;
  const walls: THREE.BufferGeometry[] = [],
    roofs: THREE.BufferGeometry[] = [],
    windows: THREE.BufferGeometry[] = [];
  const base = LAWN_Y - 0.02,
    top = LAWN_Y + b.height;

  if (b.roof === 'shelter') {
    // An open shelter: four posts and a gable roof.
    const inset = 0.02,
      post = Math.min(0.016, b.width / 8),
      postHeight = b.height * 0.75;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const g = new THREE.BoxGeometry(post, postHeight, post);
        g.translate(
          sx * (b.length / 2 - inset),
          base + postHeight / 2,
          sz * (b.width / 2 - inset),
        );
        walls.push(paint(place(g, b), finish.trim));
      }
    const rise = Math.min(0.12, b.width * 0.45);
    roofs.push(
      paint(
        place(
          gable(b.length + 0.04, b.width + 0.04, rise),
          b,
          base + postHeight,
        ),
        roofColor,
      ),
    );
    return { walls, roofs, windows };
  }

  if (b.roof === 'flat' && b.ring) {
    // Large modern buildings keep their true outline, with a light roof and parapet.
    const shape = new THREE.Shape(
      b.ring.map(([x, z]) => new THREE.Vector2(x, z)),
    );
    const body = new THREE.ExtrudeGeometry(shape, {
      depth: top - base,
      bevelEnabled: false,
    });
    body.rotateX(Math.PI / 2);
    body.translate(0, top, 0);
    walls.push(paint(body, finish.wall));
    const lid = new THREE.ExtrudeGeometry(shape, {
      depth: 0.012,
      bevelEnabled: false,
    });
    lid.rotateX(Math.PI / 2);
    lid.translate(0, top + 0.012, 0);
    roofs.push(paint(lid, roofColor));
    // A band of glazing around the long sides.
    const band = new THREE.BoxGeometry(b.length * 0.86, b.height * 0.32, 0.004);
    for (const side of [-1, 1]) {
      const g = band.clone();
      g.translate(0, base + b.height * 0.55, side * (b.width / 2 + 0.003));
      windows.push(paint(place(g, b), '#33444f'));
    }
    band.dispose();
    return { walls, roofs, windows };
  }

  // Gabled (or small flat) buildings: box walls, a door, windows, and a roof.
  const body = new THREE.BoxGeometry(b.length, top - base, b.width);
  body.translate(0, (base + top) / 2, 0);
  walls.push(paint(place(body, b), finish.wall));
  const doorWidth = Math.min(0.05, b.length * 0.22),
    doorHeight = Math.min(0.09, b.height * 0.6);
  const door = new THREE.BoxGeometry(doorWidth, doorHeight, 0.006);
  door.translate(0, base + 0.02 + doorHeight / 2, b.width / 2 + 0.002);
  walls.push(paint(place(door, b), finish.trim));
  // Windows along both long sides, leaving room for the door.
  const count = Math.max(1, Math.floor(b.length / 0.13));
  const windowSize = Math.min(0.045, b.height * 0.32);
  for (const side of [-1, 1])
    for (let i = 0; i < count; i++) {
      const u = ((i + 0.5) / count - 0.5) * b.length * 0.8;
      if (side === 1 && Math.abs(u) < doorWidth) continue;
      const g = new THREE.BoxGeometry(windowSize, windowSize, 0.005);
      g.translate(u, base + b.height * 0.62, side * (b.width / 2 + 0.002));
      windows.push(paint(place(g, b), '#2f3d47'));
    }
  if (b.roof === 'gable') {
    const overhang = 0.025;
    const rise = Math.min(0.2, b.width * 0.5);
    roofs.push(
      paint(
        place(
          gable(b.length + overhang * 2, b.width + overhang * 2, rise),
          b,
          top,
        ),
        roofColor,
      ),
    );
  } else {
    const lid = new THREE.BoxGeometry(b.length + 0.02, 0.014, b.width + 0.02);
    lid.translate(0, top + 0.007, 0);
    roofs.push(paint(place(lid, b), roofColor));
  }
  return { walls, roofs, windows };
}

/**
 * The park's own buildings, drawn from OSM footprints (scripts/park/build_features.mjs):
 * gabled roofs, shelters on posts, flat modern roofs with parapets, doors, and
 * windows that glow warm after dark. Three draws for the whole park.
 */
export function ParkBuildings({
  afterDark,
  visible = true,
}: {
  afterDark: number;
  visible?: boolean;
}) {
  const geometry = useMemo(() => {
    const walls: THREE.BufferGeometry[] = [],
      roofs: THREE.BufferGeometry[] = [],
      windows: THREE.BufferGeometry[] = [];
    for (const b of features.buildings as Building[]) {
      const parts = buildingParts(b);
      walls.push(...parts.walls);
      roofs.push(...parts.roofs);
      windows.push(...parts.windows);
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      const merged = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      return merged;
    };
    return {
      walls: merge(walls),
      roofs: merge(roofs),
      windows: merge(windows),
    };
  }, []);
  useEffect(
    () => () => {
      geometry.walls.dispose();
      geometry.roofs.dispose();
      geometry.windows.dispose();
    },
    [geometry],
  );
  return (
    <group visible={visible} name="park-buildings">
      <mesh
        geometry={geometry.walls}
        castShadow
        receiveShadow
        raycast={noRaycast}
      >
        <meshStandardMaterial vertexColors roughness={0.92} />
      </mesh>
      <mesh
        geometry={geometry.roofs}
        castShadow
        receiveShadow
        raycast={noRaycast}
      >
        <meshStandardMaterial vertexColors roughness={0.8} flatShading />
      </mesh>
      <mesh geometry={geometry.windows} raycast={noRaycast}>
        <meshStandardMaterial
          vertexColors
          roughness={0.3}
          emissive="#ffc983"
          emissiveIntensity={afterDark * 1.1}
        />
      </mesh>
    </group>
  );
}
