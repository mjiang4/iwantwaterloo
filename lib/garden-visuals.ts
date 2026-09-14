// Evergreen palette: appearance no longer changes with the calendar or saved seasons.
export const gardenPalette = {
  ground: '#c4d294',
  foliage: ['#6f973d', '#8bae49', '#507b39'],
  flower: ['#f2cf72', '#e8a2a8', '#ddd98e', '#b7cfe3'],
  water: '#8bc7cc',
};
export function seedForId(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function randomAt(seed: number, slot: number) {
  const n = Math.sin((seed % 100003) * 12.9898 + slot * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
export function growthForLikes(input: number) {
  const likes = Number.isFinite(input) ? Math.max(0, input) : 0;
  // Strong early growth, with room for every later like. No 25-like cutoff.
  const maturity = 1 - 1 / Math.sqrt(1 + likes);
  return {
    height: 0.78 + maturity * 1.35,
    fullness: 0.32 + maturity * 0.75,
    flowers: 12 * (1 - Math.exp(-likes / 12)),
    branches: Math.min(2, likes / 12),
  };
}
export type GardenMoment = {
  serial: number;
  id: string;
  kind: 'plant' | 'like';
  fromLikes: number;
};
// Fast rise, longer settle. Final values always match saved idea data.
export function growthStretch(progress: number) {
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return 1;
  const peak = 0.18;
  return (
    1 +
    0.34 *
      (progress < peak
        ? Math.sin(((progress / peak) * Math.PI) / 2)
        : ((1 - progress) / (1 - peak)) ** 2)
  );
}
export function plantingScale(progress: number) {
  if (!Number.isFinite(progress) || progress <= 0) return 0.025;
  if (progress >= 1) return 1;
  const peak = 0.24;
  return progress < peak
    ? 0.025 + 1.215 * (1 - (1 - progress / peak) ** 3)
    : 1 + 0.24 * ((1 - progress) / (1 - peak)) ** 3;
}
export const spots: [number, number][] = [
  [-3.2, 2.7],
  [0, 3.65],
  [-2.1, -1.5],
  [3.45, 2.4],
  [-4.5, 0.5],
  [3.65, -1.9],
  [-0.4, -3.5],
  [-3.7, -2.4],
  [1.8, 3.4],
  [4.5, 0.1],
  [-0.65, 2.1],
  [2.2, -3.7],
  [0.15, -1.9],
  [-4, 1.65],
  [2.9, 1.9],
  [-1.3, 4.3],
  [4.7, 1.5],
  [-2.7, -3.4],
  [0.7, -4.4],
  [2.5, -2.5],
  [3.3, 3.5],
  [-4.8, -1.4],
  [-2.8, 4],
  [1.1, 2.1],
];
export function plotPosition(plot: number) {
  return spots[((plot % spots.length) + spots.length) % spots.length];
}
// Merge intersecting 48px targets until every resulting target has breathing room.
export function clusterTargets(
  points: { x: number; y: number; index: number }[],
  spacing = 52,
) {
  const groups = points.map((p) => ({ x: p.x, y: p.y, indices: [p.index] }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < groups.length; a++)
      for (let b = a + 1; b < groups.length; b++) {
        const g = groups[a],
          h = groups[b];
        if (Math.abs(g.x - h.x) < spacing && Math.abs(g.y - h.y) < spacing) {
          const n = g.indices.length,
            m = h.indices.length;
          g.x = (g.x * n + h.x * m) / (n + m);
          g.y = (g.y * n + h.y * m) / (n + m);
          g.indices.push(...h.indices);
          groups.splice(b, 1);
          merged = true;
          break outer;
        }
      }
  }
  return groups;
}
