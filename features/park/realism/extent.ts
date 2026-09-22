import { Box3, Matrix4, Plane, Vector3 } from 'three';
import { OBB, type TileBoundingVolume } from '3d-tiles-renderer/three';

import PARK_EXTENT from '../bounds.json' with { type: 'json' };

export function parkClippingPlanes() {
  const { west, east, north, south } = PARK_EXTENT;
  return [
    new Plane(new Vector3(1, 0, 0), -west),
    new Plane(new Vector3(-1, 0, 0), east),
    new Plane(new Vector3(0, 0, 1), -north),
    new Plane(new Vector3(0, 0, -1), south),
  ];
}

/** Mask traversal outside the park without forcing off-screen tiles to load. */
export class ParkExtentPlugin {
  name = 'PARK_EXTENT_PLUGIN';
  private bounds: OBB;
  constructor(localToEarth: Matrix4) {
    const { west, east, north, south } = PARK_EXTENT;
    this.bounds = new OBB(
      new Box3(
        new Vector3(west * 30, -180, north * 30),
        new Vector3(east * 30, 600, south * 30),
      ),
      localToEarth,
    );
    this.bounds.update();
  }
  calculateTileViewError(
    tile: { engineData: { boundingVolume: TileBoundingVolume } },
    target: { inView: boolean },
  ) {
    // Ancestors intersecting the park must remain traversable to reach local leaves.
    if (tile.engineData.boundingVolume.intersectsOBB(this.bounds)) return false;
    target.inView = false;
    return true;
  }
}
