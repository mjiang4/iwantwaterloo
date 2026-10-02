'use client';
/* oxlint-disable react/react-compiler -- Animate Three.js transforms in the render loop. */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

/** Two decorative geese on Silver Lake. No physics, textures, timers, or hit targets. */
export function LakeGeese({ motion }: { motion: boolean }) {
  const flock = useRef<Group>(null);
  const time = useRef(0);
  useFrame((_, delta) => {
    if (!motion || !flock.current) return;
    time.current += Math.min(delta, 0.05);
    flock.current.position.x = 11.8 + Math.sin(time.current * 0.08) * 0.55;
    flock.current.position.z = 4.3 + Math.cos(time.current * 0.08) * 0.22;
    flock.current.rotation.y = Math.sin(time.current * 0.08) * 0.3;
  });
  return (
    <group ref={flock} position={[11.8, 0.15, 4.3]}>
      {[0, 1].map((bird) => (
        <group key={bird} position={[bird * 0.5, 0, bird * 0.32]}>
          <mesh position={[0, 0.06, 0]} scale={[0.1, 0.065, 0.18]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#9c9584" roughness={1} />
          </mesh>
          <mesh position={[0, 0.16, -0.12]}>
            <cylinderGeometry args={[0.026, 0.033, 0.2, 6]} />
            <meshStandardMaterial color="#26332d" />
          </mesh>
          <mesh position={[0, 0.27, -0.135]} scale={[0.042, 0.039, 0.06]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#202b27" />
          </mesh>
          <mesh position={[0, 0.258, -0.11]} scale={[0.044, 0.018, 0.026]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#eeeedd" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.8, 1.3, 1]}>
            <ringGeometry args={[0.29, 0.3, 24]} />
            <meshBasicMaterial
              color="#aacbce"
              transparent
              opacity={0.2}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
