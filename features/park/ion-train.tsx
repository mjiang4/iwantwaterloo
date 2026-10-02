'use client';
/* oxlint-disable react/react-compiler -- Three.js transforms advance in the render loop. */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import landmarks from '@/assets/park/landmarks.json';
import { railPath } from './rail-path';

/** One five-module ION illustration on the mapped track, not live transit telemetry. */
export function IonTrain({ motion }: { motion: boolean }) {
  const cars = useRef<(THREE.Group | null)[]>([]);
  const travel = useRef(0);
  const path = useMemo(
    () => railPath(landmarks.ion.points.map(([x, z]) => [x, z] as const)),
    [],
  );
  useFrame((_, delta) => {
    if (motion) travel.current += Math.min(delta, 0.05) * 0.22;
    const head = (path.length * 0.2 + travel.current) % (path.length + 2);
    cars.current.forEach((car, index) => {
      if (!car) return;
      const distance = head - index * 0.215;
      car.visible = distance > 0.12 && distance < path.length - 0.12;
      const p = path.at(distance);
      car.position.set(p.x, 0.15, p.z);
      car.rotation.y = p.angle;
    });
  });
  return (
    <group name="ION simulated train">
      {[0, 1, 2, 3, 4].map((index) => (
        <group
          key={index}
          ref={(el) => {
            cars.current[index] = el;
          }}
        >
          <mesh position={[0, 0.065, 0]}>
            <boxGeometry args={[0.09, 0.085, 0.2]} />
            <meshStandardMaterial
              color="#d3d7d8"
              metalness={0.35}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, 0.092, 0]}>
            <boxGeometry args={[0.092, 0.053, 0.173]} />
            <meshStandardMaterial
              color="#12242b"
              metalness={0.6}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <boxGeometry args={[0.09, 0.025, 0.201]} />
            <meshStandardMaterial
              color="#1775ae"
              metalness={0.4}
              roughness={0.25}
            />
          </mesh>
          <mesh position={[0, 0.065, -0.038]}>
            <boxGeometry args={[0.096, 0.092, 0.014]} />
            <meshStandardMaterial color="#b2b9bb" metalness={0.4} />
          </mesh>
          {index < 4 && (
            <mesh position={[0, 0.075, -0.106]}>
              <boxGeometry args={[0.075, 0.09, 0.014]} />
              <meshStandardMaterial color="#3b4244" />
            </mesh>
          )}
          {(index === 0 || index === 4) && (
            <>
              <mesh
                position={[0, 0.09, index === 0 ? 0.102 : -0.102]}
                rotation={[index === 0 ? -0.18 : 0.18, 0, 0]}
              >
                <boxGeometry args={[0.071, 0.066, 0.012]} />
                <meshStandardMaterial
                  color="#152c35"
                  metalness={0.5}
                  roughness={0.15}
                />
              </mesh>
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  position={[side * 0.03, 0.035, index === 0 ? 0.106 : -0.106]}
                >
                  <sphereGeometry args={[0.007, 6, 4]} />
                  <meshBasicMaterial
                    color={index === 0 ? '#fff7ce' : '#d66340'}
                  />
                </mesh>
              ))}
            </>
          )}
          {index === 0 && (
            <Html position={[0, 0.35, 0]} center zIndexRange={[2, 0]}>
              <span className="park-landmark park-landmark-key">ION</span>
            </Html>
          )}
          {index === 2 && (
            <mesh position={[0, 0.205, 0]} rotation={[0.5, 0, 0]}>
              <boxGeometry args={[0.007, 0.1, 0.008]} />
              <meshStandardMaterial color="#667071" />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
