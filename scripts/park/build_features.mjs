#!/usr/bin/env node
// Park buildings, playgrounds and the Silver Lake shore, for the park's details.
//
//   node scripts/park/build_features.mjs
//
// Reads the same checked-in OSM extract and projection as build_landscape.py. Each
// building gets an oriented footprint box, a roof style and a material by type, so
// the browser can draw proper roofs, walls, doors and windows instead of the base
// model's flat prisms. Perimeter has its own model (build_detail.py) and is skipped.
//
// © OpenStreetMap contributors, ODbL. Keep attribution when redistributing.
import { readFileSync, writeFileSync } from 'node:fs';

const CENTER = [43.4672, -80.5325];
const SCALE = 30; // metres per scene unit, as in build_landscape.py
const PARK_WAY = 216873421;
const OUT = 'assets/park/features.json';
const round = (v) => Math.round(v * 1000) / 1000;

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
const centroid = (ring) => [
  ring.reduce((s, p) => s + p[0], 0) / ring.length,
  ring.reduce((s, p) => s + p[1], 0) / ring.length,
];
/** Smallest oriented rectangle around a footprint (edge-aligned search). */
function orientedBox(ring) {
  let best = null;
  for (let i = 1; i < ring.length; i++) {
    const angle = Math.atan2(
      ring[i][1] - ring[i - 1][1],
      ring[i][0] - ring[i - 1][0],
    );
    const c = Math.cos(angle),
      s = Math.sin(angle);
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const [x, z] of ring) {
      const u = x * c + z * s,
        v = -x * s + z * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const u = (minU + maxU) / 2,
        v = (minV + maxV) / 2;
      best = {
        area,
        x: u * c - v * s,
        z: u * s + v * c,
        length: maxU - minU,
        width: maxV - minV,
        angle,
      };
    }
  }
  // Length runs along the ridge: always the longer side.
  if (best.width > best.length)
    [best.length, best.width, best.angle] = [
      best.width,
      best.length,
      best.angle + Math.PI / 2,
    ];
  return best;
}

// Materials by building type; named landmarks get their own character.
function material(tags) {
  const name = tags.name || '';
  if (/Grist Mill/.test(name)) return 'stone';
  if (/School House/.test(name)) return 'log';
  if (/Park Inn/.test(name)) return 'inn';
  if (tags.building === 'barn') return 'barn';
  if (tags.building === 'shed' || tags.building === 'roof') return 'timber';
  if (/Gallery|Granite|Tennis/.test(name)) return 'modern';
  return 'cream';
}

const { elements } = JSON.parse(readFileSync('assets/park/osm.json', 'utf8'));
const park = elements.find((e) => e.id === PARK_WAY)?.geometry.map(project);
if (!park) throw new Error('Park boundary not found in the OSM extract.');

const buildings = [];
const playgrounds = [];
let shore = null;
for (const e of elements) {
  if (!e.geometry) continue;
  const tags = e.tags || {};
  const ring = e.geometry.map(project);
  if (!insideRing(centroid(ring), park)) continue;
  if (tags.natural === 'water' && tags.name === 'Silver Lake')
    shore = ring.map(([x, z]) => [round(x), round(z)]);
  if (tags.leisure === 'playground') {
    const box = orientedBox(ring);
    playgrounds.push({
      x: round(box.x),
      z: round(box.z),
      length: round(box.length),
      width: round(box.width),
      angle: round(box.angle),
    });
  }
  if (!tags.building || tags.building === 'university') continue;
  const box = orientedBox(ring);
  if (box.width < 0.06) continue; // too small to read at park scale
  const levels = Number.parseFloat(tags['building:levels'] || '1') || 1;
  const height = Math.min(0.5, Math.max(0.16, (levels * 3.5) / SCALE));
  const complex =
    tags.amenity !== 'shelter' && (ring.length > 12 || box.length > 0.9);
  buildings.push({
    name: tags.name || null,
    roof:
      tags.building === 'roof' || tags.amenity === 'shelter'
        ? 'shelter'
        : complex ||
            (tags.building === 'industrial' && !/Grist Mill/.test(tags.name))
          ? 'flat'
          : 'gable',
    material: material(tags),
    height: round(height),
    x: round(box.x),
    z: round(box.z),
    length: round(box.length),
    width: round(box.width),
    angle: round(box.angle),
    // Large flat-roofed buildings keep their true outline.
    ...(complex && { ring: ring.map(([x, z]) => [round(x), round(z)]) }),
  });
}
writeFileSync(
  OUT,
  JSON.stringify(
    {
      attribution: '© OpenStreetMap contributors',
      license: 'ODbL-1.0',
      source: 'assets/park/osm.json, inside way 216873421',
      buildings,
      playgrounds,
      shore,
    },
    null,
    1,
  ) + '\n',
);
console.log(
  `${OUT}: ${buildings.length} buildings (${buildings.filter((b) => b.roof === 'gable').length} gabled, ${buildings.filter((b) => b.roof === 'flat').length} flat, ${buildings.filter((b) => b.roof === 'shelter').length} shelters), ${playgrounds.length} playgrounds, shore ${shore?.length ?? 0} points`,
);
