'use client';
/* oxlint-disable react/react-compiler -- R3F owns mutable scene objects and GPU buffers; frame updates intentionally bypass React state. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { gardenPalette, randomAt } from '@/lib/garden-visuals';
export function GardenLighting({
  night,
  motion,
}: {
  night: boolean;
  motion: boolean;
}) {
  const ambient = useRef<THREE.AmbientLight>(null),
    hemi = useRef<THREE.HemisphereLight>(null),
    sun = useRef<THREE.DirectionalLight>(null),
    blend = useRef(night ? 1 : 0),
    { invalidate } = useThree();
  const day = useMemo(() => new THREE.Color('#fff9e7'), []),
    moon = useMemo(() => new THREE.Color('#a9c6ef'), []),
    color = useMemo(() => new THREE.Color(), []);
  useEffect(() => invalidate(), [night, motion, invalidate]);
  useFrame((_, delta) => {
    const target = night ? 1 : 0;
    blend.current = motion
      ? THREE.MathUtils.damp(blend.current, target, 5, Math.min(delta, 0.05))
      : target;
    const t = blend.current;
    if (ambient.current) ambient.current.intensity = 1.05 - t * 0.55;
    if (hemi.current) {
      hemi.current.intensity = 1.5 - t * 0.6;
      hemi.current.color.copy(color.copy(day).lerp(moon, t));
    }
    if (sun.current) {
      sun.current.intensity = 2.25 - t * 1.5;
      sun.current.color.copy(color.copy(day).lerp(moon, t));
    }
    if (Math.abs(target - t) > 0.002) invalidate();
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={night ? 0.5 : 1.05} />
      <hemisphereLight ref={hemi} args={['#fff9e7', '#8d9876', 1.5]} />
      <directionalLight
        ref={sun}
        position={[-5, 10, 4]}
        intensity={2.25}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.001}
        shadow-normalBias={0.035}
      />
    </>
  );
}
export function GardenGround() {
  return (
    <mesh position={[0, -0.055, 0]} receiveShadow scale={[1, 1, 0.84]}>
      <cylinderGeometry args={[6.65, 6.65, 0.07, 64]} />
      <meshStandardMaterial color={gardenPalette.ground} roughness={1} />
    </mesh>
  );
}
// At most 18 small points in one draw, never accumulating particles or timers.
export function Atmosphere({
  night,
  motion,
  low,
}: {
  night: boolean;
  motion: boolean;
  low: boolean;
}) {
  const points = useRef<THREE.Points>(null),
    material = useRef<THREE.ShaderMaterial>(null),
    time = useRef(0);
  const uniforms = useMemo(
    () => ({
      tint: { value: new THREE.Color() },
      alpha: { value: 0.65 },
      pointSize: { value: 4 },
    }),
    [],
  );
  const { gl } = useThree();
  useEffect(() => {
    uniforms.tint.value.set('#ffe3a0');
    uniforms.pointSize.value = (night ? 7 : 3) * gl.getPixelRatio();
  }, [night, gl, uniforms]);
  const positions = useMemo(() => new Float32Array(18 * 3), []),
    last = useRef('');
  const count = !low && night ? 8 : 0;
  useFrame((_, delta) => {
    const key = `${night}:${count}`;
    if (!motion && last.current === key) return;
    last.current = key;
    if (motion) time.current += Math.min(delta, 0.05);
    for (let i = 0; i < count; i++) {
      const phase = randomAt(170, i) * 6.28,
        t = time.current;
      positions[i * 3] =
        Math.sin(phase) * (2.2 + randomAt(180, i) * 3) +
        Math.sin(t * 0.24 + phase) * 0.12;
      positions[i * 3 + 2] = Math.cos(phase) * (1.5 + randomAt(190, i) * 2.7);
      positions[i * 3 + 1] = 0.5 + randomAt(200, i) * 0.8 + Math.sin(t * 0.8 + phase) * 0.08;
    }
    if (points.current) {
      points.current.geometry.setDrawRange(0, count);
      points.current.geometry.attributes.position.needsUpdate = true;
    }
    if (material.current)
      material.current.uniforms.alpha.value = night
        ? 0.6 + Math.sin(time.current * 0.8) * 0.15
        : 0.65;
  });
  return (
    <points ref={points} frustumCulled={false} raycast={() => {}}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        vertexShader="uniform float pointSize; void main(){ gl_PointSize=pointSize; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
        fragmentShader={
          'uniform vec3 tint; uniform float alpha; void main(){ float r=length(gl_PointCoord-vec2(.5)); float glow=pow(max(0.0,1.0-r*2.0),1.5); gl_FragColor=vec4(tint,glow*alpha);\n#include <colorspace_fragment>\n}'
        }
      />
    </points>
  );
}
export type GardenEvent = { kind: 'pond' | 'goose'; serial: number };
export function Ripple({
  event,
  motion,
}: {
  event: GardenEvent | null;
  motion: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null),
    material = useRef<THREE.MeshBasicMaterial>(null),
    progress = useRef(1),
    { invalidate } = useThree();
  useEffect(() => {
    progress.current = event?.kind === 'pond' ? 0 : 1;
    invalidate();
  }, [event, invalidate]);
  useFrame((_, delta) => {
    if (!mesh.current || !material.current) return;
    if (!motion) {
      progress.current = 1;
      mesh.current.visible = event?.kind === 'pond';
      mesh.current.scale.set(1.2, 0.72, 1);
      material.current.opacity = 0.35;
      return;
    }
    progress.current = Math.min(
      1,
      progress.current + Math.min(delta, 0.05) / 0.85,
    );
    const t = progress.current;
    mesh.current.visible = t < 1;
    mesh.current.scale.set(0.1 + t * 1.9, (0.1 + t * 1.9) * 0.58, 1);
    material.current.opacity = (1 - t) * 0.6;
    if (t < 1) invalidate();
  });
  return (
    <mesh
      ref={mesh}
      position={[1.9, 0.092, 0.2]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
      raycast={() => {}}
    >
      <ringGeometry args={[0.98, 1, 48]} />
      <meshBasicMaterial
        ref={material}
        color="#e5faf4"
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

export function Meadow() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D(),
      color = new THREE.Color();
    for (let i = 0; i < 65; i++) {
      const a = randomAt(450, i) * Math.PI * 2,
        r = 4.5 + randomAt(670, i) * 1.7;
      object.position.set(Math.sin(a) * r, 0.09, Math.cos(a) * r * 0.81);
      object.scale.set(0.04 + randomAt(780, i) * 0.07, 0.055, 0.04);
      object.updateMatrix();
      mesh.current.setMatrixAt(i, object.matrix);
      mesh.current.setColorAt(i, color.set(gardenPalette.flower[i % 4]));
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh
      name="meadow"
      ref={mesh}
      args={[undefined, undefined, 65]}
      frustumCulled={false}
      raycast={() => {}}
    >
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}
