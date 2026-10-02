#!/usr/bin/env node
// The walkable footpath network inside Waterloo Park, for the park's people.
//
//   node scripts/park/build_paths.mjs
//
// Reads the same checked-in OSM extract and projection as build_landscape.py, so
// walkers follow exactly the paths the model draws. Keeps the ways the model renders
// as paths (footway, path, cycleway, pedestrian, steps, service), clips them to the
// park boundary (OSM way 216873421) and joins them where they share a node. Points
// where a path leaves the park become gates, where people arrive and go home.
//
// © OpenStreetMap contributors, ODbL. Keep attribution when redistributing.
import { readFileSync, writeFileSync } from 'node:fs';

const CENTER = [43.4672, -80.5325];
const SCALE = 30; // metres per scene unit, as in build_landscape.py
const PARK_WAY = 216873421;
const QUANTUM = 100; // store coordinates as integers of 1/100 unit (30 cm)
const WALKABLE = new Set([
  'footway',
  'path',
  'cycleway',
  'pedestrian',
  'steps',
  'service',
]);
const OUT = 'public/park/paths.json';

const project = ({ lat, lon }) => [
  ((lon - CENTER[1]) * 111320 * Math.cos((CENTER[0] * Math.PI) / 180)) / SCALE,
  -((lat - CENTER[0]) * 111320) / SCALE,
];
function insideRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i],
      [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}

const { elements } = JSON.parse(readFileSync('assets/park/osm.json', 'utf8'));
const park = elements.find((e) => e.id === PARK_WAY)?.geometry.map(project);
if (!park) throw new Error('Park boundary not found in the OSM extract.');

// Nodes are shared OSM nodes: identical coordinates, merged on the 30 cm grid.
const nodes = new Map(); // key -> { i, x, z, gate }
const edges = new Set();
const key = ([x, z]) => `${Math.round(x * QUANTUM)},${Math.round(z * QUANTUM)}`;
function node(point) {
  const k = key(point);
  if (!nodes.has(k))
    nodes.set(k, { i: nodes.size, x: point[0], z: point[1], gate: false });
  return nodes.get(k);
}
for (const way of elements) {
  const tags = way.tags || {};
  if (!WALKABLE.has(tags.highway) || !way.geometry) continue;
  if (tags.area === 'yes' || tags.access === 'private') continue;
  const points = way.geometry.map(project);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const inA = insideRing(a, park),
      inB = insideRing(b, park);
    if (!inA && !inB) continue;
    const na = node(a),
      nb = node(b);
    // A path continuing out of the park: its last inside point is a gate.
    if (!inA) {
      nb.gate = true;
      continue;
    }
    if (!inB) {
      na.gate = true;
      continue;
    }
    if (na !== nb)
      edges.add(na.i < nb.i ? `${na.i}-${nb.i}` : `${nb.i}-${na.i}`);
  }
}

// Keep the largest connected network; isolated fragments would strand walkers.
const list = [...nodes.values()];
const adjacent = list.map(() => []);
for (const e of edges) {
  const [a, b] = e.split('-').map(Number);
  adjacent[a].push(b);
  adjacent[b].push(a);
}
let best = [];
const seen = new Set();
for (const start of list) {
  if (seen.has(start.i) || !adjacent[start.i].length) continue;
  const component = [];
  const stack = [start.i];
  seen.add(start.i);
  while (stack.length) {
    const n = stack.pop();
    component.push(n);
    for (const m of adjacent[n])
      if (!seen.has(m)) {
        seen.add(m);
        stack.push(m);
      }
  }
  if (component.length > best.length) best = component;
}
const keep = new Map(best.map((old, i) => [old, i]));
const out = {
  attribution: '© OpenStreetMap contributors',
  license: 'ODbL-1.0',
  source: 'assets/park/osm.json, footpaths inside way 216873421',
  quantum: QUANTUM,
  // Flat [x0, z0, x1, z1, …] in 1/quantum scene units.
  nodes: best.flatMap((old) => [
    Math.round(list[old].x * QUANTUM),
    Math.round(list[old].z * QUANTUM),
  ]),
  // Flat [a0, b0, a1, b1, …] node index pairs.
  edges: [...edges].flatMap((e) => {
    const [a, b] = e.split('-').map(Number);
    return keep.has(a) && keep.has(b) ? [keep.get(a), keep.get(b)] : [];
  }),
  gates: best.flatMap((old, i) => (list[old].gate ? [i] : [])),
};
writeFileSync(OUT, JSON.stringify(out));
console.log(
  `${OUT}: ${best.length} nodes, ${out.edges.length / 2} edges, ${out.gates.length} gates, ${(JSON.stringify(out).length / 1024).toFixed(1)} KB`,
);
