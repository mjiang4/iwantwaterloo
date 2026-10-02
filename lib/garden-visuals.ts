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
    height: 1 + maturity * 0.95 + (likes >= 5 ? 0.15 : 0),
    fullness: 0.55 + maturity * 0.48 + (likes >= 5 ? 0.12 : 0),
    fruits:
      likes < 5
        ? 0
        : likes < 15
          ? 4 + (likes - 5) * 0.4
          : Math.min(12, 8 + ((likes - 15) * 4) / 15),
    fruitSize: likes < 5 ? 0 : 0.1 + Math.min(1, (likes - 5) / 25) * 0.025,
    flowers: likes < 15 ? 0 : 4 + 8 * (1 - Math.exp(-(likes - 15) / 18)),
    branches: Math.min(2, likes / 10),
  };
}
export type GardenMoment = {
  serial: number;
  id: string;
  kind: 'plant' | 'like';
  fromLikes: number;
};
// Grow toward the saved size without overshoot or a shrinking settle.
export function growthAtProgress(start: number, end: number, progress: number) {
  const t = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return start + (end - start) * (1 - (1 - t) ** 3);
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
  [5.6, -1.8],
  [-2.4, 0.6],
  [-6.0, -0.2],
  [-1.6, -4.6],
  [-5.6, 1.8],
  [6.0, 0.6],
  [0.8, 5.0],
  [4.8, 3.0],
  [-4.8, 3.0],
  [4.8, -3.0],
  [-3.2, -0.6],
  [3.6, -3.8],
  [2.4, 4.6],
  [0.8, -3.0],
  [-0.4, -5.0],
  [-4.8, -3.0],
  [-1.2, 1.0],
  [-2.4, 1.8],
  [5.6, -0.6],
  [-0.4, 5.0],
  [-1.2, 3.0],
  [-1.2, -1.0],
  [-3.6, -3.8],
  [4.0, -1.0],
];
export function plotPosition(plot: number) {
  return spots[((plot % spots.length) + spots.length) % spots.length];
}
// Resolve overlapping invisible touch targets only after an actual tap.
export function hitTreeTargets(
  targets: {
    id: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[],
  x: number,
  y: number,
) {
  return targets
    .filter((t) => x >= t.left && x <= t.right && y >= t.top && y <= t.bottom)
    .map((t) => t.id);
}
