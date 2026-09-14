'use client';
/* oxlint-disable react/react-compiler -- R3F animation mutates a bounded scene and visit record outside React rendering. */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { advanceButterfly, type ButterflyVisit } from '@/lib/garden-discovery';
const noRaycast = () => {};

// One five-second visit per page session, discovered with three pond taps.
// Two draws, no shadows/textures/lights, and no allocations or React updates per frame.
export function GardenButterfly({
  visit,
  enabled,
}: {
  visit: RefObject<ButterflyVisit>;
  enabled: boolean;
}) {
  const group = useRef<THREE.Group>(null),
    wings = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const transform = useMemo(() => new THREE.Object3D(), []);
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.035);
    s.lineTo(0.075, -0.1);
    s.quadraticCurveTo(0.19, -0.1, 0.13, 0.005);
    s.quadraticCurveTo(0.23, 0.15, 0.12, 0.17);
    s.quadraticCurveTo(0.035, 0.18, 0, 0.035);
    s.closePath();
    return s;
  }, []);
  useEffect(() => {
    if (!enabled) {
      advanceButterfly(visit.current, 0, false);
      if (group.current) group.current.visible = false;
      invalidate();
    }
  }, [enabled, visit, invalidate]);
  useEffect(
    () => () => {
      visit.current.elapsed = -1;
    },
    [visit],
  );
  useFrame((_, delta) => {
    if (!group.current || !wings.current) return;
    const t = advanceButterfly(visit.current, delta, enabled);
    group.current.visible = t >= 0;
    if (t < 0) return;
    const seconds = visit.current.elapsed;
    group.current.position.set(
      -2.8 + t * 5.5,
      1.4 + Math.sin(t * Math.PI) * 0.75 + Math.sin(seconds * 3) * 0.06,
      2.1 + Math.sin(t * Math.PI * 2) * 0.55,
    );
    group.current.rotation.set(
      -Math.PI / 2 + 0.22,
      0.12 * Math.sin(seconds * 2),
      -0.4,
    );
    group.current.scale.setScalar(Math.min(1, t / 0.12, (1 - t) / 0.12));
    for (let i = 0; i < 2; i++) {
      const flap = 0.3 + (Math.sin(seconds * 26) + 1) * 0.5;
      transform.rotation.set(0, i === 0 ? flap : Math.PI - flap, 0);
      transform.updateMatrix();
      wings.current.setMatrixAt(i, transform.matrix);
    }
    wings.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group ref={group} name="pond-butterfly" visible={false}>
      <instancedMesh
        ref={wings}
        name="butterfly-wings"
        args={[undefined, undefined, 2]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <shapeGeometry args={[shape, 5]} />
        <meshBasicMaterial color="#d6a163" side={THREE.DoubleSide} />
      </instancedMesh>
      <mesh raycast={noRaycast}>
        <cylinderGeometry args={[0.012, 0.009, 0.15, 5]} />
        <meshBasicMaterial color="#655340" />
      </mesh>
    </group>
  );
}
