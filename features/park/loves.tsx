'use client';
/* oxlint-disable react/react-compiler -- Instance buffers, raycasts and shader uniforms are owned by the renderer. */
/**
 * Loves in the park: wildflower drifts by day, fireflies after dark, and a few
 * one-line "I love" chips. Ideas are the canopy; loves are the ground.
 *
 * Every flower is checked against the park model so it sits on grass — never on
 * a path, the lake or a building. `?loves=demo` swaps in sample drifts for look
 * development; those use sample copy and are not user data.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomAt } from '@/lib/garden-visuals';
import type { Love } from '@/features/loves/model';
import type { ParkLook } from './look';

const noRaycast = () => {};
const FIREFLIES_PER_DRIFT = 8;
/** At most this many chips compete for space; the rest are flowers only. */
const MAX_CHIPS = 8;
const LANDSCAPE = 'park-landscape';

export type LoveDrift = {
  id: string;
  centre: [number, number, number];
  flowers: [number, number, number][];
  body: string;
  echoes: number;
  createdAt: number;
};

/** Sample captions only — placeholders for real resident loves. */
const SAMPLE_LOVES: Record<string, string> = {
  'demo-love-1': 'The boardwalk at sunset, when half of Uptown is out walking.',
  'demo-love-4': 'Stumbling on the log schoolhouse between classes.',
};
type DemoFile = {
  drifts: { id: string; centre: number[]; flowers: number[][] }[];
};
/** Sample drifts, loaded only when look development asks for them. */
function demoDrifts(file: DemoFile): LoveDrift[] {
  return file.drifts.map((d, i) => ({
    id: d.id,
    centre: d.centre as [number, number, number],
    flowers: d.flowers as [number, number, number][],
    body: SAMPLE_LOVES[d.id] ?? '',
    echoes: 0,
    createdAt: -i,
  }));
}

function seedFor(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Waits for the base landscape to exist, then offers a lawn height lookup. */
function useLawnProbe() {
  const { scene } = useThree();
  const [root, setRoot] = useState<THREE.Object3D | null>(null);
  useFrame(() => {
    if (!root) {
      const found = scene.getObjectByName(LANDSCAPE);
      if (found) setRoot(found);
    }
  });
  return useMemo(() => {
    if (!root) return null;
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    return (x: number, z: number): number | null => {
      ray.set(new THREE.Vector3(x, 20, z), down);
      const hit = ray.intersectObject(root, true)[0];
      return hit?.object.name === 'lawn' ? hit.point.y : null;
    };
  }, [root]);
}

/** A hard ceiling for every love's flowers together (the documented budget). */
const MAX_FLOWERS = 720;

/**
 * Real loves become drifts on grass; a love with more "me too"s spreads wider.
 * Flowers share one budget: past it, every drift shrinks in proportion but
 * keeps at least a few blooms. Each drift is cached by love and size, so a
 * "me too" re-probes only the love that changed.
 */
export function useLoveDrifts(loves: Love[] | undefined, demoMode: boolean) {
  const probe = useLawnProbe();
  const cache = useRef(new Map<string, LoveDrift | null>());
  const [demo, setDemo] = useState<LoveDrift[] | null>(null);
  useEffect(() => {
    if (!demoMode || demo) return;
    let live = true;
    void import('./loves-demo.json').then((file) => {
      if (live) setDemo(demoDrifts(file.default as DemoFile));
    });
    return () => {
      live = false;
    };
  }, [demoMode, demo]);
  return useMemo(() => {
    if (demoMode) return demo ?? [];
    if (!loves || !probe) return [];
    const wanted = loves.map((love) => 7 + Math.min(love.echoes * 2, 14));
    const total = wanted.reduce((sum, n) => sum + n, 0);
    const scale = total > MAX_FLOWERS ? MAX_FLOWERS / total : 1;
    const seen = new Set<string>();
    const drifts = loves.flatMap((love, index): LoveDrift[] => {
      const want = Math.max(3, Math.floor(wanted[index] * scale));
      const key = `${love.id}:${want}:${love.echoes}`;
      seen.add(key);
      if (!cache.current.has(key)) {
        const seed = seedFor(love.id);
        const radius = 0.45 + Math.min(love.echoes, 10) * 0.03;
        const flowers: [number, number, number][] = [];
        for (let k = 0; k < want * 6 && flowers.length < want; k++) {
          const a = randomAt(seed, k * 2) * Math.PI * 2;
          const r = radius * Math.sqrt(randomAt(seed, k * 2 + 1));
          const x = love.x + Math.cos(a) * r,
            z = love.z + Math.sin(a) * r;
          const y = probe(x, z);
          if (y !== null) flowers.push([x, y, z]);
        }
        cache.current.set(
          key,
          flowers.length
            ? {
                id: love.id,
                centre: [
                  love.x,
                  probe(love.x, love.z) ?? flowers[0][1],
                  love.z,
                ],
                flowers,
                body: love.body,
                echoes: love.echoes,
                createdAt: love.createdAt,
              }
            : null,
        );
      }
      const drift = cache.current.get(key);
      return drift ? [drift] : [];
    });
    for (const key of cache.current.keys())
      if (!seen.has(key)) cache.current.delete(key);
    return drifts;
  }, [loves, probe, demoMode, demo]);
}

/**
 * While planting a love, a tap (not a drag) on grass reports that spot.
 * Taps on paths, water or buildings are rejected so a love always sits on lawn.
 */
export function LovePlacement({
  onPlace,
  onReject,
}: {
  onPlace: (x: number, z: number) => void;
  onReject: () => void;
}) {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let start: { x: number; y: number; t: number } | null = null;
    // The tap that places a love must not also select the tree under it.
    let swallowClick = false;
    const click = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
    };
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const up = (e: PointerEvent) => {
      if (
        !start ||
        Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6 ||
        performance.now() - start.t > 600
      )
        return;
      const root = scene.getObjectByName(LANDSCAPE);
      if (!root) return;
      const rect = el.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObject(root, true)[0];
      swallowClick = true;
      if (hit?.object.name === 'lawn') onPlace(hit.point.x, hit.point.z);
      else onReject();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('click', click, true);
    };
  }, [gl, camera, scene, onPlace, onReject]);
  return null;
}

const fireflyVertex = `uniform float uTime;uniform float uSize;attribute float aPhase;varying float vTwinkle;
void main(){vec3 p=position;p.y+=sin(uTime*.9+aPhase)*.14;p.x+=sin(uTime*.37+aPhase*1.7)*.18;p.z+=cos(uTime*.31+aPhase*2.3)*.18;
vec4 mv=modelViewMatrix*vec4(p,1.);vTwinkle=.55+.45*sin(uTime*2.1+aPhase*3.);gl_PointSize=uSize*vTwinkle/-mv.z;gl_Position=projectionMatrix*mv;}`;
const fireflyFragment = `uniform vec3 uColor;uniform float uGlow;varying float vTwinkle;
void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);a*=a;gl_FragColor=vec4(uColor*(1.+a),a*uGlow*vTwinkle);
#include <colorspace_fragment>
}`;

/**
 * One flower: five pointed petals with chamfered edges, tilted up into a cup so
 * the silhouette reads from the elevated camera. Flat shading lets each facet
 * catch the light. Built once and shared by every bloom.
 */
function petalGeometry() {
  const petal = new THREE.Shape();
  petal.moveTo(0, 0);
  petal.bezierCurveTo(0.4, 0.18, 0.36, 0.74, 0, 1);
  petal.bezierCurveTo(-0.36, 0.74, -0.4, 0.18, 0, 0);
  const base = new THREE.ExtrudeGeometry(petal, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.05,
    bevelSegments: 1,
    curveSegments: 2,
  });
  base.deleteAttribute('uv');
  const petals = Array.from({ length: 5 }, (_, i) =>
    base
      .clone()
      // Lie flat pointing outward, raise the tip into a cup, then fan around.
      .rotateX(-Math.PI / 2)
      .rotateX(0.55)
      .rotateY((i / 5) * Math.PI * 2),
  );
  base.dispose();
  const flower = mergeGeometries(petals);
  petals.forEach((g) => g.dispose());
  return flower;
}
function centreGeometry() {
  return new THREE.IcosahedronGeometry(0.3, 0)
    .scale(1, 0.62, 1)
    .translate(0, 0.16, 0);
}

function Blooms({
  drifts,
  look,
  afterDark,
}: {
  drifts: LoveDrift[];
  look: ParkLook;
  afterDark: number;
}) {
  const petalRef = useRef<THREE.InstancedMesh>(null);
  const centreRef = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const geometry = useMemo(
    () => ({ petals: petalGeometry(), centre: centreGeometry() }),
    [],
  );
  useEffect(
    () => () => {
      geometry.petals.dispose();
      geometry.centre.dispose();
    },
    [geometry],
  );
  const count = drifts.reduce((sum, d) => sum + d.flowers.length, 0);
  // Capacity grows in steps, so one more "me too" never rebuilds the meshes.
  const capacity = Math.ceil(count / 128) * 128;
  useEffect(() => {
    const petals = petalRef.current,
      centres = centreRef.current;
    if (!petals || !centres) return;
    const o = new THREE.Object3D(),
      c = new THREE.Color(),
      palette = look.loves.petals;
    let i = 0;
    drifts.forEach((drift, d) => {
      const base = seedFor(drift.id);
      drift.flowers.forEach(([x, y, z], f) => {
        const seed = base + f;
        const size = 0.12 + randomAt(seed, 3) * 0.07;
        o.position.set(x, y + 0.02, z);
        // A slight lean and spin so a drift never looks stamped.
        o.rotation.set(
          (randomAt(seed, 6) - 0.5) * 0.35,
          randomAt(seed, 2) * Math.PI * 2,
          (randomAt(seed, 7) - 0.5) * 0.35,
        );
        o.scale.setScalar(size);
        o.updateMatrix();
        petals.setMatrixAt(i, o.matrix);
        centres.setMatrixAt(i, o.matrix);
        // Each drift leans toward one colour, with a few neighbours mixed in.
        const pick =
          randomAt(seed, 4) < 0.7
            ? d
            : d + 1 + Math.floor(randomAt(seed, 5) * 3);
        petals.setColorAt(i, c.set(palette[pick % palette.length]));
        i++;
      });
    });
    for (const mesh of [petals, centres]) {
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    invalidate();
  }, [drifts, look, invalidate, count]);
  if (!count) return null;
  // Capacity is fixed per mesh, so a new total remounts them (only when loves change).
  return (
    <>
      <instancedMesh
        key={`petals-${capacity}`}
        ref={petalRef}
        args={[geometry.petals, undefined, capacity]}
        frustumCulled={false}
        raycast={noRaycast}
        receiveShadow
      >
        <meshStandardMaterial
          roughness={0.62}
          flatShading
          side={THREE.DoubleSide}
          emissive={look.loves.firefly}
          emissiveIntensity={afterDark * 0.1}
        />
      </instancedMesh>
      <instancedMesh
        key={`centres-${capacity}`}
        ref={centreRef}
        args={[geometry.centre, undefined, capacity]}
        frustumCulled={false}
        raycast={noRaycast}
      >
        <meshStandardMaterial
          color="#e39a2d"
          roughness={0.55}
          flatShading
          emissive="#ffb347"
          emissiveIntensity={afterDark * 0.35}
        />
      </instancedMesh>
    </>
  );
}

function Fireflies({
  drifts,
  look,
  afterDark,
  motion,
}: {
  drifts: LoveDrift[];
  look: ParkLook;
  afterDark: number;
  motion: boolean;
}) {
  const { invalidate } = useThree();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fireflyVertex,
        fragmentShader: fireflyFragment,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 420 },
          uGlow: { value: 0 },
          uColor: { value: new THREE.Color() },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const geometry = useMemo(() => {
    const n = drifts.length * FIREFLIES_PER_DRIFT;
    const position = new Float32Array(n * 3),
      phase = new Float32Array(n);
    drifts.forEach((drift, d) => {
      const base = seedFor(drift.id) + 500;
      for (let k = 0; k < FIREFLIES_PER_DRIFT; k++) {
        const i = d * FIREFLIES_PER_DRIFT + k,
          seed = base + k;
        const [fx, fy, fz] = drift.flowers[k % drift.flowers.length];
        position.set(
          [
            fx + (randomAt(seed, 1) - 0.5) * 0.6,
            fy + 0.35 + randomAt(seed, 2) * 0.7,
            fz + (randomAt(seed, 3) - 0.5) * 0.6,
          ],
          i * 3,
        );
        phase[i] = randomAt(seed, 4) * Math.PI * 2;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, [drifts]);
  useEffect(() => {
    material.uniforms.uColor.value.set(look.loves.firefly);
    material.uniforms.uGlow.value = afterDark;
    invalidate();
  }, [material, look, afterDark, invalidate]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, delta) => {
    if (motion && afterDark > 0.02)
      material.uniforms.uTime.value += Math.min(delta, 0.05);
  });
  return (
    <points
      geometry={geometry}
      material={material}
      visible={afterDark > 0.02 && drifts.length > 0}
      frustumCulled={false}
      raycast={noRaycast}
    />
  );
}

export function LoveMeadow({
  drifts,
  look,
  afterDark,
  motion,
  selectedId,
  onSelect,
}: {
  drifts: LoveDrift[];
  look: ParkLook;
  /** 0 in daylight rising to 1 at night. */
  afterDark: number;
  motion: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  // The selected love always gets a chip; then the most echoed, then the newest.
  const chips = useMemo(
    () =>
      drifts
        .filter((d) => d.body)
        .sort(
          (a, b) =>
            Number(b.id === selectedId) - Number(a.id === selectedId) ||
            b.echoes - a.echoes ||
            b.createdAt - a.createdAt,
        )
        .slice(0, MAX_CHIPS),
    [drifts, selectedId],
  );
  return (
    <>
      <Blooms drifts={drifts} look={look} afterDark={afterDark} />
      <Fireflies
        drifts={drifts}
        look={look}
        afterDark={afterDark}
        motion={motion}
      />
      {chips.map((d) => (
        <Html
          key={d.id}
          position={[d.centre[0], d.centre[1] + 0.55, d.centre[2]]}
          center
          zIndexRange={[3, 0]}
        >
          <button
            type="button"
            className={`love-caption ${d.id === selectedId ? 'is-selected' : ''}`}
            data-placement="above"
            disabled={!onSelect}
            aria-label={`I love: ${d.body}`}
            onClick={() => onSelect?.(d.id)}
          >
            <span className="love-caption-kicker" aria-hidden="true">
              I love
            </span>
            <span className="love-caption-quote" aria-hidden="true">
              {d.body}
            </span>
          </button>
        </Html>
      ))}
    </>
  );
}
