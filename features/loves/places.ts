import type { LoveLandmark } from './model';

/**
 * Named park places for planting a love without tapping the scene (keyboard,
 * no WebGL, the list view). Each point is on lawn near the landmark,
 * found with the same grass checks as tap placement.
 */
export const LOVE_PLACES: {
  id: LoveLandmark;
  label: string;
  x: number;
  z: number;
}[] = [
  { id: 'silver-lake', label: 'Silver Lake', x: 12.09, z: 4.91 },
  { id: 'grist-mill', label: 'The Grist Mill', x: 17.24, z: 4.51 },
  { id: 'log-school-house', label: 'The Log School House', x: 6.78, z: 0.82 },
  { id: 'park-inn', label: 'Park Inn', x: 7.6, z: 1.86 },
  { id: 'perimeter', label: 'Perimeter Institute', x: 12.73, z: 6.82 },
  { id: 'ion', label: 'The ION line', x: -3.56, z: -5.37 },
];

/** Where a new love goes: a tapped point, or "let me choose a place". */
export type LoveSpot =
  | { x: number; z: number; landmark?: LoveLandmark }
  | { choose: true };
