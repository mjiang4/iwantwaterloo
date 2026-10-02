#!/usr/bin/env node
// Surrounding-city context for the park: building footprints from OpenStreetMap.
//
//   node scripts/park/build_context.mjs            # fetch from Overpass and build
//   node scripts/park/build_context.mjs --cached   # rebuild from the saved extract
//
// Uses the same projection as build_landscape.py (30 m per scene unit, centred on
// the park) so the city lines up with the model. Buildings inside the park extent
// are skipped — the park model already has them. Heights use OSM `height` or
// `building:levels` where mapped and a modest default by building type otherwise:
// an approximation for atmosphere, not a survey.
//
// © OpenStreetMap contributors, ODbL. Keep attribution when redistributing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const CENTER = [43.4672, -80.5325];
const SCALE = 30; // metres per scene unit
const RADIUS_M = 2600;
const EXTENT = JSON.parse(readFileSync('features/park/bounds.json', 'utf8'));
const RAW = 'work/park-context-osm.json'; // ignored local caches of the raw extracts
const RAW_ROADS = 'work/park-context-roads-osm.json';
// Map-style thinning keeps the context light: near the park almost everything
// stays; farther out only large or tall buildings, which the fog softens anyway.
const NEAR_UNITS = 46; // ≈1.4 km
const FAR_MIN_AREA_M2 = 450;
const FAR_MIN_HEIGHT_M = 13;
const SIMPLIFY_UNITS = 0.05; // ≈1.5 m
const QUANTUM = 100; // store coordinates as integers of 1/100 unit (30 cm)
const OUT = 'public/park/context.json';

const dLat = RADIUS_M / 111320;
const dLon = RADIUS_M / (111320 * Math.cos((CENTER[0] * Math.PI) / 180));
const bbox = [
  CENTER[0] - dLat,
  CENTER[1] - dLon,
  CENTER[0] + dLat,
  CENTER[1] + dLon,
]
  .map((v) => v.toFixed(5))
  .join(',');

async function overpass(filter, cache) {
  if (process.argv.includes('--cached') && existsSync(cache))
    return JSON.parse(readFileSync(cache, 'utf8'));
  const query = `[out:json][timeout:120];way${filter}(${bbox});out geom tags;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: {
      'User-Agent':
        'iwantwaterloo-park-context/1.0 (github.com/mjiang4/iwantwaterloo)',
    },
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  const data = await res.json();
  mkdirSync('work', { recursive: true });
  writeFileSync(cache, JSON.stringify(data));
  return data;
}

const project = ({ lat, lon }) => [
  ((lon - CENTER[1]) * 111320 * Math.cos((CENTER[0] * Math.PI) / 180)) / SCALE,
  -((lat - CENTER[0]) * 111320) / SCALE,
];

const HOUSES = new Set([
  'house',
  'detached',
  'semidetached_house',
  'terrace',
  'residential',
  'bungalow',
]);
const DEFAULT_HEIGHT = {
  house: 7,
  detached: 7,
  semidetached_house: 7,
  terrace: 8,
  garage: 3,
  garages: 3,
  shed: 3,
  residential: 9,
  apartments: 16,
  dormitory: 18,
  commercial: 10,
  retail: 7,
  office: 18,
  university: 15,
  school: 9,
  college: 12,
  hospital: 18,
  church: 12,
  industrial: 9,
  warehouse: 8,
  hotel: 20,
  civic: 12,
  public: 12,
  parking: 10,
};
function heightMetres(tags) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 1) return Math.min(h, 160);
  const levels = parseFloat(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0)
    return Math.min(levels * 3.3 + 1, 160);
  return DEFAULT_HEIGHT[tags.building] ?? 8;
}

// Douglas–Peucker on a closed ring (keeps at least a triangle).
function simplify(points, tolerance) {
  if (points.length <= 4) return points;
  const dist = ([x, z], [ax, az], [bx, bz]) => {
    const dx = bx - ax,
      dz = bz - az;
    const len = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len));
    return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
  };
  const run = (pts) => {
    let max = 0,
      index = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[0], pts.at(-1));
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (max <= tolerance) return [pts[0], pts.at(-1)];
    return [
      ...run(pts.slice(0, index + 1)).slice(0, -1),
      ...run(pts.slice(index)),
    ];
  };
  const ring = run([...points, points[0]]).slice(0, -1);
  return ring.length >= 3 ? ring : points;
}

// Signed area in scene units² (for size filtering and winding).
function area(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i],
      [x2, z2] = points[(i + 1) % points.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

const data = await overpass('["building"]', RAW);
// Kept for tree placement: every mapped footprint, before thinning.
const footprints = [];
const FOOT_CELL = 2;
const footGrid = new Map();
const cellKey = (x, z) =>
  `${Math.floor(x / FOOT_CELL)},${Math.floor(z / FOOT_CELL)}`;
const insidePark = ([x, z]) =>
  x > EXTENT.west && x < EXTENT.east && z > EXTENT.north && z < EXTENT.south;
const buildings = [];
let skippedPark = 0,
  skippedTiny = 0,
  skippedFar = 0;
for (const el of data.elements) {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) continue;
  let pts = el.geometry.map(project);
  if (
    pts.length > 1 &&
    pts[0][0] === pts.at(-1)[0] &&
    pts[0][1] === pts.at(-1)[1]
  )
    pts.pop();
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length,
    cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  {
    const ring = pts;
    const xs = ring.map((p) => p[0]),
      zs = ring.map((p) => p[1]);
    const box = [
      Math.min(...xs),
      Math.min(...zs),
      Math.max(...xs),
      Math.max(...zs),
    ];
    const index = footprints.push({ ring, box }) - 1;
    for (
      let gx = Math.floor(box[0] / FOOT_CELL);
      gx <= Math.floor(box[2] / FOOT_CELL);
      gx++
    )
      for (
        let gz = Math.floor(box[1] / FOOT_CELL);
        gz <= Math.floor(box[3] / FOOT_CELL);
        gz++
      ) {
        const k = `${gx},${gz}`;
        if (!footGrid.has(k)) footGrid.set(k, []);
        footGrid.get(k).push(index);
      }
  }
  if (insidePark([cx, cz])) {
    skippedPark++;
    continue;
  }
  const a = Math.abs(area(pts)) * SCALE * SCALE; // m²
  if (a < 35) {
    skippedTiny++;
    continue;
  } // sheds and garages add triangles, not a sense of city
  const metres = heightMetres(el.tags || {});
  const far = Math.hypot(cx, cz) > NEAR_UNITS;
  if (far && a < FAR_MIN_AREA_M2 && metres < FAR_MIN_HEIGHT_M) {
    skippedFar++;
    continue;
  }
  pts = simplify(pts, SIMPLIFY_UNITS);
  // Consistent winding (counter-clockwise in x/z) for outward-facing walls.
  if (area(pts) < 0) pts.reverse();
  buildings.push({
    // Integer 1/QUANTUM units: plenty for context at this scale, and compact.
    p: pts.flatMap(([x, z]) => [
      Math.round(x * QUANTUM),
      Math.round(z * QUANTUM),
    ]),
    h: Math.round((metres / SCALE) * QUANTUM),
    // 1 = house-like (pitched-roof palette), 0 = larger building (flat roofs).
    k: HOUSES.has(el.tags?.building) ? 1 : 0,
  });
}
// ── Streets: the park's paths continue into the city's streets. ──────────────
const ROAD_WIDTH_M = {
  motorway: 22,
  trunk: 18,
  primary: 15,
  secondary: 13,
  tertiary: 11,
  residential: 8,
  unclassified: 8,
  living_street: 7,
  pedestrian: 6,
  service: 5,
  footway: 2.4,
  path: 2.4,
  cycleway: 2.4,
};
const MINOR = new Set(['service', 'footway', 'path', 'cycleway']);
function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const [ax, az] = points[0],
    [bx, bz] = points.at(-1);
  let max = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, z] = points[i];
    const dx = bx - ax,
      dz = bz - az,
      len = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len));
    const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= tolerance) return [points[0], points.at(-1)];
  return [
    ...simplifyLine(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplifyLine(points.slice(index), tolerance),
  ];
}
const roadData = await overpass('["highway"]', RAW_ROADS);
const roads = [];
const treeSeeds = [];
for (const el of roadData.elements) {
  const type = el.tags?.highway;
  const width = ROAD_WIDTH_M[type];
  if (!width || !el.geometry || el.geometry.length < 2) continue;
  if (el.tags?.area === 'yes' || el.tags?.tunnel === 'yes') continue;
  let pts = el.geometry.map(project);
  const mid = pts[Math.floor(pts.length / 2)];
  const far = Math.hypot(mid[0], mid[1]) > NEAR_UNITS;
  if (far && MINOR.has(type)) continue; // small ways only near the park
  pts = simplifyLine(pts, SIMPLIFY_UNITS);
  roads.push({
    w: Math.round((width / SCALE) * QUANTUM),
    p: pts.flatMap(([x, z]) => [
      Math.round(x * QUANTUM),
      Math.round(z * QUANTUM),
    ]),
  });
  if (
    ['residential', 'living_street', 'tertiary', 'unclassified'].includes(
      type,
    ) &&
    !far
  )
    treeSeeds.push({ pts, half: width / SCALE / 2 });
}

// ── Street trees: greenery spills out of the park along residential streets. ─
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
const inBuilding = (p) =>
  (footGrid.get(cellKey(p[0], p[1])) || []).some((i) => {
    const { ring, box } = footprints[i];
    return (
      p[0] >= box[0] &&
      p[0] <= box[2] &&
      p[1] >= box[1] &&
      p[1] <= box[3] &&
      insideRing(p, ring)
    );
  });
const TREE_SPACING = 0.62; // ≈18 m
const TREE_KERB = 0.13; // ≈4 m beyond the kerb
const TREE_CELL = 0.28;
const treeGrid = new Set();
const trees = [];
let rng = 7;
const random = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296;
for (const { pts, half } of treeSeeds) {
  let carry = random() * TREE_SPACING,
    side = 1;
  for (let i = 0; i < pts.length - 1 && trees.length < 4000; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (!len) continue;
    const nx = -(bz - az) / len,
      nz = (bx - ax) / len;
    for (let d = carry; d < len; d += TREE_SPACING) {
      side = -side;
      const offset = half + TREE_KERB + random() * 0.06;
      const p = [
        ax + ((bx - ax) * d) / len + nx * offset * side,
        az + ((bz - az) * d) / len + nz * offset * side,
      ];
      if (insidePark(p) || inBuilding(p)) continue;
      const cell = `${Math.floor(p[0] / TREE_CELL)},${Math.floor(p[1] / TREE_CELL)}`;
      if (treeGrid.has(cell)) continue;
      treeGrid.add(cell);
      trees.push(Math.round(p[0] * QUANTUM), Math.round(p[1] * QUANTUM));
    }
    carry = (carry - len) % TREE_SPACING;
    if (carry < 0) carry += TREE_SPACING;
  }
}

const out = {
  attribution: '© OpenStreetMap contributors',
  license: 'https://opendatacommons.org/licenses/odbl/1-0/',
  source: 'Overpass API: way["building"], way["highway"]',
  retrievedAt: data.osm3s?.timestamp_osm_base ?? null,
  center: CENTER,
  metersPerUnit: SCALE,
  quantum: QUANTUM,
  radiusMeters: RADIUS_M,
  buildings,
  roads,
  // Flat [x, z, x, z, …] in 1/QUANTUM units.
  trees,
};
writeFileSync(OUT, JSON.stringify(out));
const kb = (JSON.stringify(out).length / 1024).toFixed(0);
const triangles = buildings.reduce(
  (t, b) => t + (b.p.length / 2) * 2 + (b.p.length / 2 - 2),
  0,
);
console.log(
  `buildings ${buildings.length} · skipped: park ${skippedPark}, tiny ${skippedTiny}, far ${skippedFar} · ~${triangles} building triangles`,
);
console.log(
  `roads ${roads.length} · street trees ${trees.length / 2} · ${kb} KB → ${OUT}`,
);
