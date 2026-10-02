import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared low-poly silhouettes, including stems and leaves in the same draw.
// One species per tree keeps its identity stable as more fruit appears.
export function createFruitGeometry(kind: 'apple' | 'pear' | 'orange') {
  const parts: THREE.BufferGeometry[] = [];
  function add(geometry: THREE.BufferGeometry, tint: string) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    const color = new THREE.Color(tint);
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  }
  if (kind === 'orange') {
    for (const side of [-1, 1]) {
      const fruit = new THREE.IcosahedronGeometry(0.72, 1);
      fruit.translate(side * 0.48, side * 0.2 - 0.05, 0);
      add(fruit, side < 0 ? '#e8a04d' : '#efb15f');
    }
  } else {
    const profile =
      kind === 'pear'
        ? [
            [0, -1],
            [0.5, -0.9],
            [0.82, -0.55],
            [0.9, -0.15],
            [0.7, 0.35],
            [0.4, 0.85],
            [0.28, 1.15],
            [0, 1.2],
          ]
        : [
            [0, -0.65],
            [0.45, -0.8],
            [0.8, -0.55],
            [1, -0.05],
            [0.94, 0.5],
            [0.6, 0.75],
            [0.25, 0.64],
            [0, 0.5],
          ];
    const fruit = new THREE.LatheGeometry(
      profile.map(([x, y]) => new THREE.Vector2(x, y)),
      10,
    );
    add(fruit, kind === 'apple' ? '#cf6460' : '#e8c773');
  }
  const top = kind === 'pear' ? 1.2 : 0.7;
  const stem = new THREE.CylinderGeometry(0.07, 0.085, 0.45, 5);
  stem.rotateZ(-0.2);
  stem.translate(0.03, top + 0.12, 0);
  add(stem, '#70553d');
  const leaf = new THREE.IcosahedronGeometry(1, 0);
  leaf.scale(0.42, 0.1, 0.18);
  leaf.rotateZ(0.45);
  leaf.translate(0.34, top + 0.24, 0);
  add(leaf, '#395f40');
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}
